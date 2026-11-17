# WhatsApp Login Demo

Prototipo frontend para registrar un correo, asociar un numero telefonico y simular una autorizacion desde WhatsApp.

## Ejecutar

Abre `index.html` directamente en el navegador o usa:

```bash
npm.cmd install
npm.cmd run serve
```

## Configurar WhatsApp destino

Por defecto, el QR usa el telefono capturado en el formulario. Si cada usuario tiene un numero distinto, deja `src/config.js` asi:

```js
window.WHATSAPP_LOGIN_CONFIG = {
  receiverMode: "registered-phone",
  authorizationReceiverPhone: ""
};
```

Si quieres que todos los codigos lleguen a un solo WhatsApp fijo, cambia a:

```js
window.WHATSAPP_LOGIN_CONFIG = {
  receiverMode: "fixed",
  authorizationReceiverPhone: "525512345678"
};
```

Tambien puedes probar un destino puntual con `?wa=525512345678`. Por seguridad, WhatsApp no permite enviar el mensaje automaticamente desde un sitio web; el usuario debe tocar Enviar.

## Redireccion desde login

El formato del QR envia `Param1` en Base64 con texto UTF-8. Se admite la marca BOM del enlace de origen. El contenido es:

```text
34|PortalSerPub_SerPubVal02.asp|105|7221484739|
```

Los campos son el ultimo octeto de `201.122.44.`, la ruta (cada `_` representa `/`), la clave y el telefono. Se conservan los campos adicionales y sus separadores.

Con telefono, la pantalla pasa directo a autorizacion por WhatsApp. Si el campo del telefono esta vacio, por ejemplo `34|PortalSerPub_SerPubVal02.asp|105||`, se muestra el formulario para registrarlo. La IP, ruta y clave del QR se conservan durante la autorizacion.

Ejemplo recibido:

```text
index.html?Param1=77u/MzR8UG9ydGFsU2VyUHViX1NlclB1YlZhbDAyLmFzcHwxMDV8NzIyMTQ4NDczOXw=
```

Se mantienen los enlaces anteriores que enviaban el telefono directamente en `Param1`:

```text
index.html?Param1=7221484739&Param2=19.4326,-99.1332
```

`Param2` acepta coordenadas en formato `lat,lng`. Si no llegan, se solicita la ubicacion al navegador, como en el flujo manual. Sin `Param1` o con `Param1` vacio, tambien se permite registrar el telefono manualmente. Un `Param1` malformado o duplicado muestra un error y no crea una sesion.

## Guardar accesos

Al presionar `Accesar` con el codigo correcto, la app abre automaticamente la pantalla de destino. El telefono se envia en segundo plano a `guardar-acceso.php`, sin retrasar la redireccion, y se conserva una copia local del ultimo acceso. Ese archivo guarda los accesos en:

```text
data/accesos.json
```

En hosting PHP, asegúrate de que la carpeta `data` tenga permisos de escritura para PHP.

Despues de verificar correctamente, los enlaces nuevos apuntan al ASP indicado por el QR. Se envia en Base64 `|clave|telefono|dato1|...|`, reemplazando el campo vacio por el telefono validado, sin el prefijo mexicano `52`. Por ejemplo, `|105|7221484739|` produce:

```text
http://201.122.44.34/PortalSerPub/SerPubVal02.asp?Param1=fDEwNXw3MjIxNDg0NzM5fA%3D%3D
```

Los enlaces anteriores y el registro sin QR siguen enviando el telefono directamente en `Param1`. Las coordenadas se conservan en `Param2` del enlace al portal.

## Consola visible de prueba

`debugConsole: true` en `src/config.js` activa la consola al final de la pantalla. Muestra el parametro recibido, su contenido decodificado, errores, registro del telefono, resultado del guardado local y enlace preparado para ASP. El boton `Copiar diagnostico` permite enviarlo al desarrollador; si el navegador no ofrece acceso al portapapeles, selecciona el texto para copiarlo manualmente.

La redireccion al ASP es automatica al validar el codigo, incluso con la consola activada. El diagnostico muestra el enlace de destino; no implica que el ASP ya haya respondido.

Para ocultar la consola, cambia `debugConsole` a `false`.

## Pruebas

```bash
npm.cmd test
```

## Integracion real de WhatsApp

Este demo abre WhatsApp con un mensaje de autorizacion y valida el codigo en el navegador. Para validar automaticamente desde WhatsApp se necesita un backend que genere el reto, guarde sesiones, reciba webhooks y envie/reciba mensajes mediante WhatsApp Business Cloud API o un proveedor como Twilio.
