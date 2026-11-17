WORLD OF TANKS MINI ARCADE - VERSION ONLINE

QUÉ INCLUYE
- Cuentas online: crear usuario, contraseña y recuperar el progreso desde otro ordenador.
- Guardado en servidor de XP, créditos, euros, tanques desbloqueados y mejoras.
- Multijugador por salas privadas de hasta 3 jugadores.
- Contraseñas protegidas con hash scrypt (no se guardan en texto normal).

IMPORTANTE
El HTML por sí solo no puede alojar una base de datos ni un servidor multijugador.
Este paquete incluye el servidor, pero para jugar desde casas distintas hay que
publicarlo en un servicio que permita Node.js y WebSockets. El servidor debe estar
encendido para que funcionen las cuentas y las partidas online.

PRUEBA EN TU ORDENADOR (con ayuda de un adulto)
1. Instala Node.js LTS desde https://nodejs.org/
2. Descomprime esta carpeta.
3. Abre la carpeta "wot_mini_online".
4. En la barra de dirección del Explorador escribe cmd y pulsa Enter.
5. Escribe: npm install
6. Cuando termine, escribe: npm start
7. Abre Google Chrome y entra en: http://localhost:8080

PARA JUGAR CON AMIGOS DESDE OTRAS CASAS
- Publica esta carpeta en un alojamiento compatible con Node.js y WebSockets.
- Configura el servicio para ejecutar "npm start".
- Usa el puerto que indique el alojamiento (el servidor lee PORT automáticamente).
- Abre el juego desde la dirección HTTPS que te dé el alojamiento.
- En el panel online, deja vacía la dirección del servidor: se detectará sola.
- Un jugador pulsa CREAR SALA y comparte el código; los demás lo introducen y
  pulsan UNIRSE.

CUENTAS
- Escribe un usuario de 3 a 20 caracteres (letras, números, _ o -).
- La primera vez que uses un usuario se crea la cuenta.
- Las siguientes veces, usa la misma contraseña para recuperar el progreso.
- No uses una contraseña que utilices en otros sitios.

DATOS
El servidor crea data/accounts.json automáticamente. Haz copias de seguridad
de la carpeta data para conservar las cuentas. No compartas ese archivo.
