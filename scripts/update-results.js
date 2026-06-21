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

  // Fetch finished/live matches from football-data.org
  const data = await fetchJSON(
    'https://api.football-data.org/v4/competitions/WC/matches?status=FINISHED',
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
    const scoreHome = apiMatch.score?.fullTime?.home;
    const scoreAway = apiMatch.score?.fullTime?.away;

    if (scoreHome === null || scoreHome === undefined ||
        scoreAway === null || scoreAway === undefined) continue;

    // Match by team names
    const ourMatch = ourMatches.find(m =>
      m.teamA === homeSpanish && m.teamB === awaySpanish
    );

    if (!ourMatch) {
      console.log(`No match found for: ${homeSpanish} vs ${awaySpanish}`);
      continue;
    }

    // Skip if already has the correct score
    if (ourMatch.scoreA === scoreHome && ourMatch.scoreB === scoreAway) continue;

    const matchId = String(ourMatch.id);
    await db.collection('quiniela').doc('main')
      .collection('matches').doc(matchId).update({
        scoreA: scoreHome,
        scoreB: scoreAway,
      });

    console.log(`Updated match ${ourMatch.id}: ${homeSpanish} ${scoreHome}-${scoreAway} ${awaySpanish}`);
    updated++;
  }

  console.log(`Done. ${updated} matches updated.`);
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
