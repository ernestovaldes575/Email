window.WHATSAPP_LOGIN_CONFIG = {
  // "registered-phone": el QR manda el mensaje al telefono capturado en el formulario.
  // "fixed": el QR manda el mensaje siempre al numero authorizationReceiverPhone.
  receiverMode: "registered-phone",

  // Usalo solo cuando receiverMode sea "fixed".
  // Formato recomendado: codigo de pais + numero, sin +, espacios ni guiones.
  // Ejemplo Mexico: "525512345678"
  authorizationReceiverPhone: ""
};
