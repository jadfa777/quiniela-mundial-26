const admin = require('firebase-admin');
const https = require('https');

const TEAM_MAP = {
  'Germany': 'Alemania',
  'Saudi Arabia': 'Arabia Saudita',
  'Algeria': 'Argelia',
  'Argentina': 'Argentina',
  'Australia': 'Australia',
  'Austria': 'Austria',
  'Bosnia-Herzegovina': 'Bosnia y Herzegovina',
  'Bosnia and Herzegovina': 'Bosnia y Herzegovina',
  'Brazil': 'Brasil',
  'Belgium': 'Bélgica',
  'Cabo Verde': 'Cabo Verde',
  'Cape Verde': 'Cabo Verde',
  'Cape Verde Islands': 'Cabo Verde',
  'Cape Verde Islands': 'Cabo Verde',
  'Canada': 'Canadá',
  'Colombia': 'Colombia',
  'Korea Republic': 'Corea del Sur',
  'South Korea': 'Corea del Sur',
  "Côte d'Ivoire": 'Costa de Marfil',
  'Ivory Coast': 'Costa de Marfil',
  'Croatia': 'Croacia',
  'Curaçao': 'Curazao',
  'Curacao': 'Curazao',
  'Ecuador': 'Ecuador',
  'Egypt': 'Egipto',
  'Scotland': 'Escocia',
  'Spain': 'España',
  'United States': 'Estados Unidos',
  'USA': 'Estados Unidos',
  'France': 'Francia',
  'Ghana': 'Ghana',
  'Haiti': 'Haití',
  'England': 'Inglaterra',
  'Iraq': 'Irak',
  'Iran': 'Irán',
  'Japan': 'Japón',
  'Jordan': 'Jordania',
  'Morocco': 'Marruecos',
  'Mexico': 'México',
  'Norway': 'Noruega',
  'New Zealand': 'Nueva Zelanda',
  'Panama': 'Panamá',
  'Paraguay': 'Paraguay',
  'Netherlands': 'Países Bajos',
  'Portugal': 'Portugal',
  'Qatar': 'Qatar',
  'DR Congo': 'RD Congo',
  'Congo DR': 'RD Congo',
  'Czech Republic': 'República Checa',
  'Czechia': 'República Checa',
  'Senegal': 'Senegal',
  'South Africa': 'Sudáfrica',
  'Sweden': 'Suecia',
  'Switzerland': 'Suiza',
  'Turkey': 'Turquía',
  'Türkiye': 'Turquía',
  'Tunisia': 'Túnez',
  'Uruguay': 'Uruguay',
  'Uzbekistan': 'Uzbekistán',
};

function toSpanish(name) {
  return TEAM_MAP[name] || name;
}

function fetchJSON(url, token) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: { 'X-Auth-Token': token }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function main() {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) throw new Error('Missing FOOTBALL_DATA_TOKEN');

  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  // Load our matches from Firestore to get the ID mapping
  const matchesSnap = await db.collection('quiniela').doc('main')
    .collection('matches').get();

  const ourMatches = matchesSnap.docs.map(d => d.data());

  // Fetch finished matches from football-data.org — season=2026 avoids returning 2022 WC results
  const data = await fetchJSON(
    'https://api.football-data.org/v4/competitions/WC/matches?season=2026&status=FINISHED',
    token
  );

  if (!data.matches || !Array.isArray(data.matches)) {
    console.log('No matches returned from API:', JSON.stringify(data));
    return;
  }

  console.log(`Fetched ${data.matches.length} finished matches from API`);

  let updated = 0;

  for (const apiMatch of data.matches) {
    const homeSpanish = toSpanish(apiMatch.homeTeam?.name || '');
    const awaySpanish = toSpanish(apiMatch.awayTeam?.name || '');
    let scoreHome = apiMatch.score?.fullTime?.home;
    let scoreAway = apiMatch.score?.fullTime?.away;

    if (scoreHome === null || scoreHome === undefined ||
        scoreAway === null || scoreAway === undefined) continue;

    // Match by team names (try both home/away orderings since API designation may differ from our JSON)
    let ourMatch = ourMatches.find(m =>
      m.teamA === homeSpanish && m.teamB === awaySpanish
    );
    let teamsSwapped = false;
    if (!ourMatch) {
      ourMatch = ourMatches.find(m =>
        m.teamA === awaySpanish && m.teamB === homeSpanish
      );
      if (ourMatch) teamsSwapped = true;
    }
    if (teamsSwapped) {
      // Swap scores to match our teamA/teamB order
      [scoreHome, scoreAway] = [scoreAway, scoreHome];
    }

    if (!ourMatch) {
      console.log(`No match found for: ${homeSpanish} vs ${awaySpanish}`);
      continue;
    }

    // Skip if already has the correct score and sign
    const sign = scoreHome > scoreAway ? '1' : scoreHome < scoreAway ? '2' : 'X';
    if (ourMatch.scoreA === scoreHome && ourMatch.scoreB === scoreAway && ourMatch.sign === sign) continue;

    // Compute winner for knockout stages using the API's official winner field
    const updates = { scoreA: scoreHome, scoreB: scoreAway, sign };
    if (ourMatch.phase !== 'Grupos') {
      const apiWinner = apiMatch.score?.winner; // 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW'
      if (apiWinner === 'HOME_TEAM') updates.winner = ourMatch.teamA;
      else if (apiWinner === 'AWAY_TEAM') updates.winner = ourMatch.teamB;
    }

    const matchId = String(ourMatch.id);
    await db.collection('quiniela').doc('main')
      .collection('matches').doc(matchId).update(updates);

    console.log(`Updated match ${ourMatch.id}: ${ourMatch.teamA} ${scoreHome}-${scoreAway} ${ourMatch.teamB} [${sign}]`);
    updated++;
  }

  console.log(`Done. ${updated} matches updated.`);
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
