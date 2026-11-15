# Linux Ports

Extensión de GNOME Shell de **AlvaroEng98**, inspirada en [Port Kill](https://github.com/treadiehq/port-kill).

UUID: `linuxports@alvaroeng98`

Muestra los puertos TCP/UDP en escucha y el proceso que los ocupa. Cada fila aparece como `Kill: Port <puerto>: <proceso>`; al hacer clic se pide confirmación y se envía `SIGTERM` al proceso. La interfaz usa el icono `supply.png`.

## Requisitos

- GNOME Shell 50
- `ss` (normalmente incluido en `iproute2`)
- `ps` (normalmente incluido en `procps`)

La extensión no solicita privilegios automáticamente. Los procesos de otros usuarios pueden requerir permisos adicionales y aparecerán como fallidos si el usuario actual no puede terminarlos.

## Instalación local

```bash
mkdir -p ~/.local/share/gnome-shell/extensions/linuxports@alvaroeng98
cp metadata.json extension.js stylesheet.css supply.png ~/.local/share/gnome-shell/extensions/linuxports@alvaroeng98/
gnome-extensions enable linuxports@alvaroeng98
```

En Wayland, reinicia GNOME Shell o cierra y vuelve a iniciar sesión si la extensión no aparece inmediatamente.

Repositorio: https://github.com/AlvaroEng98/LinuxPorts

## Uso

El icono `supply.png` aparece en la barra superior. Al abrirlo se actualiza la lista; también se actualiza automáticamente cada cinco segundos cuando el menú está cerrado. Al seleccionar un proceso se pide confirmación y se envía `SIGTERM`, permitiendo que cierre limpiamente.

## Alcance actual

- Solo procesos con sockets en escucha que `ss` pueda identificar.
- No incluye todavía búsqueda, `SIGKILL`, exclusiones ni reinicio automático.
- La lista depende de los permisos de visibilidad del sistema y de `ss`.
