# Quiniela Mundial 2026 - Co-Workers

Aplicación web para gestionar una quiniela/porla del Mundial de Fútbol 2026 con compañeros de trabajo. Permite registrar participantes, ingresar pronósticos de partidos, ver resultados en tiempo real y consultar el ranking automático de puntos.

**Live:** https://jadfa777.github.io/quiniela-mundial-26/

---

## Características

- **Pronósticos** — Cada participante predice el marcador exacto de los 104 partidos (fase de grupos + eliminatorias)
- **Resultados oficiales** — El administrador ingresa los resultados reales y los puntos se calculan automáticamente
- **Ranking en tiempo real** — Clasificación actualizada con los puntos acumulados por cada participante
- **Podio / Bonus** — Predicciones extra: campeón, subcampeón y cuatro semifinalistas
- **Sincronización en la nube** — Los datos se guardan en Firebase Firestore; todos los usuarios ven el mismo estado en tiempo real
- **Sistema de autenticación por PIN** — Cada participante crea un nombre de usuario y un PIN de 4 dígitos para acceder desde cualquier dispositivo
- **Respaldo de datos** — Exportar/importar el estado completo en formato JSON
- **Horarios en hora de España (CEST)** — Los 104 partidos incluyen fecha y hora oficial en UTC+2

---

## Sistema de puntuación

| Acierto | Puntos |
|---|---|
| Marcador exacto | 3 |
| Resultado (ganador o empate) | 1 |
| Clasificado a siguiente ronda | 2 |
| Campeón | 12 |
| Subcampeón | 8 |
| Semifinalista | 5 |

Los puntos son configurables desde la pestaña **Reglas** (solo administrador).

---

## Tecnología

- HTML5 + CSS3 + JavaScript vanilla (sin frameworks ni bundlers)
- Firebase Firestore (Spark plan) para persistencia y sincronización
- GitHub Pages para hosting estático

---

## Estructura de archivos

```
├── index.html       # Estructura HTML de la SPA
├── app.js           # Lógica completa de la aplicación
├── style.css        # Estilos
└── matches.json     # Calendario oficial FIFA 2026 (104 partidos, horarios CEST)
```

---

## Despliegue

El sitio se despliega automáticamente desde la rama `main` con GitHub Pages.

Para publicar cambios:

```bash
git add .
git commit -m "descripción del cambio"
git push
```

GitHub Pages actualiza en ~30 segundos.

---

## Administración

Accede con el nombre de usuario **Admin** y el PIN de administrador para:
- Ingresar resultados oficiales de partidos
- Gestionar participantes (añadir, editar, activar/desactivar)
- Modificar el sistema de puntuación
- Exportar/importar copias de seguridad

---

## Calendario

Los 104 partidos están ordenados cronológicamente en `matches.json`. Los grupos (A–L) comprenden los partidos 1–72; las eliminatorias (octavos, cuartos, semis, final) comprenden los partidos 73–104.

Primer partido: **México vs Sudáfrica — 11 de junio de 2026 a las 21:00 (hora España)**
