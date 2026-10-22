# Configuración de un cliente FTP/SFTP en Hostinger

## 1. Protocolos admitidos

Hostinger permite utilizar **FTP plano** y **SFTP**, pero la disponibilidad y la configuración son diferentes.

### FTP plano

- **Protocolo:** FTP – File Transfer Protocol.
- **Puerto:** `21`.
- **Cifrado en FileZilla:** `Only use plain FTP`.
- **Disponibilidad:** habilitado de forma predeterminada en los planes compatibles de hosting web, cloud y Agency.
- **Seguridad:** la sesión no utiliza el cifrado integral de SFTP. No se recomienda para transferir información sensible a través de redes públicas.
- **Cuentas adicionales:** permite crear usuarios FTP independientes y restringirlos a un directorio específico.

Configuración de ejemplo:

```text
Protocol: FTP - File Transfer Protocol
Host: [IP FTP indicada por Hostinger]
Port: 21
Encryption: Only use plain FTP
Logon Type: Normal
User: [usuario FTP]
Password: [contraseña FTP]
```

> En el hosting administrado de Hostinger, la configuración documentada para FTP es **FTP plano**. No debe seleccionarse FTPS explícito o implícito salvo que el panel o el soporte de Hostinger indiquen lo contrario para el plan contratado.

### SFTP

- **Protocolo:** SFTP – SSH File Transfer Protocol.
- **Puerto:** `65002`.
- **Cifrado:** la transferencia viaja cifrada mediante SSH.
- **Disponibilidad:** requiere un plan que incluya acceso SSH o acceso remoto. Hostinger lo documenta para planes Premium o superiores.
- **Activación:** se debe habilitar previamente SSH Access o Remote Access desde el panel.
- **Usuario:** usuario FTP/SSH informado por Hostinger.
- **Contraseña:** puede utilizar la contraseña FTP/SSH del dominio principal o una contraseña exclusiva para SSH, según la configuración disponible.

Configuración de ejemplo:

```text
Protocol: SFTP - SSH File Transfer Protocol
Host: [IP indicada en SSH Access o Remote Access]
Port: 65002
Logon Type: Normal
User: [usuario FTP/SSH]
Password: [contraseña FTP/SSH o contraseña SSH]
```

La primera vez que se realiza una conexión SFTP, el cliente puede mostrar la clave del servidor. Antes de aceptarla permanentemente, se debe comprobar que el host y la huella correspondan al servidor de Hostinger.

## 2. Comparación rápida

| Característica | FTP plano | SFTP |
|---|---|---|
| Puerto | `21` | `65002` |
| Cifrado de la transferencia | No | Sí, mediante SSH |
| Disponible en todos los planes compatibles con FTP | Sí | No |
| Requiere SSH o acceso remoto | No | Sí |
| Permite cuentas FTP adicionales restringidas por carpeta | Sí | No está documentado como equivalente para cuentas FTP adicionales |
| Uso recomendado | Acceso limitado sin información sensible | Administración y transferencia segura |

## 3. Cuenta FTP principal o adicional

### Cuenta principal

La cuenta principal utiliza el usuario FTP asignado al sitio. Dependiendo del dominio, el usuario puede tener formatos como:

```text
u12345678
u12345678.dominio.com
```

La cuenta principal normalmente tiene acceso al contenido general del sitio asociado. No se recomienda compartirla con clientes o terceros si solamente necesitan acceder a una carpeta.

### Cuenta FTP adicional

Hostinger permite crear una cuenta FTP adicional con:

- usuario independiente;
- contraseña independiente;
- directorio asignado;
- acceso limitado a una carpeta determinada.

Ruta en el panel:

```text
Websites > Dashboard > FTP Accounts > Create a New FTP Account
```

Ejemplo de directorio restringido:

```text
/public_html/clientes/cliente-a/
```

El usuario generado puede seguir una estructura similar a:

```text
u12345678.cliente-a
```

El formato exacto debe copiarse desde la sección **FTP Accounts** del panel.

> Las cuentas FTP adicionales están documentadas para conexiones FTP. No se debe asumir que un usuario FTP adicional limitado a una carpeta también podrá conectarse mediante SFTP. Para SFTP se utiliza el usuario FTP/SSH informado en **SSH Access** o **Remote Access**.

## 4. Datos que deben entregarse al cliente

### Si utilizará FTP plano

```text
Protocolo: FTP
Servidor: [IP FTP o nombre del servidor]
Puerto: 21
Cifrado: Only use plain FTP
Tipo de acceso: Normal
Usuario: [usuario FTP principal o adicional]
Contraseña: [contraseña FTP]
Directorio autorizado: [carpeta asignada]
```

### Si utilizará SFTP

```text
Protocolo: SFTP - SSH File Transfer Protocol
Servidor: [IP de SSH Access o Remote Access]
Puerto: 65002
Tipo de acceso: Normal
Usuario: [usuario FTP/SSH]
Contraseña: [contraseña FTP/SSH o SSH]
```

No se debe mezclar la configuración de ambos protocolos. Por ejemplo, **SFTP con puerto 21** o **FTP con puerto 65002** producirá un error de conexión.

## 5. Configuración en FileZilla

### FTP plano

1. Abrir **FileZilla**.
2. Ingresar a **File > Site Manager**.
3. Seleccionar **New Site**.
4. Elegir `FTP - File Transfer Protocol`.
5. Informar la IP FTP de Hostinger.
6. Configurar el puerto `21`.
7. En cifrado, seleccionar `Only use plain FTP`.
8. En tipo de acceso, seleccionar `Normal`.
9. Informar el usuario y la contraseña FTP.
10. Presionar **Connect**.

### SFTP

1. Verificar que SSH o Remote Access esté habilitado en Hostinger.
2. Abrir **FileZilla**.
3. Ingresar a **File > Site Manager**.
4. Seleccionar **New Site**.
5. Elegir `SFTP - SSH File Transfer Protocol`.
6. Informar la IP indicada por Hostinger.
7. Configurar el puerto `65002`.
8. En tipo de acceso, seleccionar `Normal`.
9. Informar el usuario FTP/SSH y su contraseña.
10. Presionar **Connect**.

## 6. Errores frecuentes

### Error `530 Login incorrect`

Comprobar:

- que el host corresponda al plan donde está alojado el sitio;
- que se esté utilizando el nombre de usuario FTP completo;
- que no existan espacios antes o después de la contraseña;
- que se esté utilizando la contraseña FTP correcta;
- que el usuario adicional corresponda al directorio y sitio correctos.

Si los datos son correctos, cambiar la contraseña FTP y volver a intentar. Si el acceso por IP continúa fallando, Hostinger recomienda probar con el nombre del servidor disponible en **Plan Details**.

### Tiempo de espera agotado

- comprobar la conexión a Internet;
- reiniciar el router o dispositivo de red;
- revisar que no se esté bloqueando el puerto `21` o `65002`;
- verificar que el protocolo y el puerto coincidan;
- aumentar temporalmente el tiempo de espera del cliente FTP.

### El usuario accede a una carpeta incorrecta

Revisar el directorio asignado a la cuenta adicional desde **FTP Accounts**. Para evitar acceso al sitio completo, no asignar `/public_html` cuando el cliente solamente debe administrar una subcarpeta.

### SFTP no conecta

Comprobar:

- que el plan incluya acceso SSH o remoto;
- que SSH Access o Remote Access esté habilitado;
- que se utilice SFTP, no FTP;
- que el puerto sea `65002`;
- que se utilice el usuario FTP/SSH, no una cuenta FTP adicional sin acceso SSH documentado.

## 7. Recomendación de uso

- Utilizar **SFTP** cuando el plan lo permita y el usuario necesite administrar archivos de manera segura.
- Utilizar una **cuenta FTP adicional restringida por carpeta** cuando sea imprescindible separar el acceso de distintos clientes y la cuenta adicional no disponga de SFTP.
- No compartir la cuenta principal del hosting si puede utilizarse una cuenta adicional.
- Crear una contraseña única por cliente y eliminar la cuenta cuando finalice el acceso.
- Evitar transferir credenciales, copias de bases de datos u otros archivos sensibles mediante FTP plano.

## 8. Fuentes oficiales

- Hostinger Support: How to connect to your hosting using FTP in Hostinger  
  https://www.hostinger.com/support/4480505-how-to-connect-to-your-hosting-using-ftp-in-hostinger/
- Hostinger Support: How to connect to your hosting using SFTP in Hostinger  
  https://www.hostinger.com/support/5972689-how-to-connect-to-your-hosting-using-sftp-in-hostinger/
- Hostinger Support: How to create additional FTP accounts in Hostinger  
  https://www.hostinger.com/support/1583246-how-to-create-additional-ftp-accounts/
- Hostinger Support: How to fix FTP connection errors in Hostinger  
  https://www.hostinger.com/support/1583242-how-to-fix-ftp-connection-errors-in-hostinger/
- Hostinger Support: Which file transfer and server access options are supported at Hostinger  
  https://www.hostinger.com/support/which-file-transfer-and-server-access-options-are-supported-at-hostinger/
