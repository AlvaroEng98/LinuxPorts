import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const REFRESH_INTERVAL_SECONDS = 5;

const PortRow = GObject.registerClass(
class PortRow extends PopupMenu.PopupBaseMenuItem {
    _init(port, onKill) {
        super._init({can_focus: true});

        this._port = port;
        this._onKill = onKill;
        this.add_child(new St.Label({
            text: `Kill: Port ${port.port}: ${port.process}`,
            style_class: 'linuxports-row-title',
            x_align: Clutter.ActorAlign.START,
        }));
        this.connect('activate', () => this._onKill(this._port));
    }
});

const LinuxPortsIndicator = GObject.registerClass(
class LinuxPortsIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'LinuxPorts');

        this._ports = [];
        this._loading = false;
        this._refreshTimeout = 0;
        const iconFile = Gio.File.new_for_uri(import.meta.url).get_parent().get_child('supply.png');
        this._icon = new St.Icon({
            gicon: Gio.FileIcon.new(iconFile),
            style_class: 'system-status-icon',
            icon_size: 16,
        });
        this.add_child(this._icon);

        this._header = new PopupMenu.PopupMenuItem('Kill All Processes', {reactive: false});
        this.menu.addMenuItem(this._header);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._content = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._content);

        this.menu.connect('open-state-changed', (_menu, open) => {
            if (open)
                this._refresh();
        });

        this._refresh();
        this._refreshTimeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT,
            REFRESH_INTERVAL_SECONDS, () => {
                if (!this.menu.isOpen)
                    this._refresh();
                return GLib.SOURCE_CONTINUE;
            });
    }

    _refresh() {
        if (this._loading)
            return;

        this._loading = true;
        this._setContentMessage('Buscando puertos…');
        this._loadPorts().catch(error => {
            this._setContentMessage(`Error: ${error.message}`);
        }).finally(() => {
            this._loading = false;
        });
    }

    async _loadPorts() {
        const usersOutput = await this._runCommand(['ps', '-eo', 'pid=,user=']);
        const users = new Map();
        for (const line of usersOutput.split('\n')) {
            const match = line.trim().match(/^(\d+)\s+(\S+)$/);
            if (match)
                users.set(match[1], match[2]);
        }

        const portsOutput = await this._runCommand(['ss', '-H', '-ltnup']);
        this._ports = this._parsePorts(portsOutput, users);
        this._render();
    }

    _runCommand(argv) {
        return new Promise((resolve, reject) => {
            const subprocess = Gio.Subprocess.new(
                argv,
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
            );
            subprocess.communicate_utf8_async(null, null, (process, result) => {
                try {
                    const [, stdout, stderr] = process.communicate_utf8_finish(result);
                    if (!process.get_successful())
                        reject(new Error(stderr?.trim() || `${argv[0]} terminó con error`));
                    else
                        resolve(stdout);
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    _parsePorts(output, users) {
        const ports = [];
        const seen = new Set();

        for (const line of output.split('\n')) {
            const columns = line.trim().split(/\s+/);
            if (columns.length < 6)
                continue;

            const protocol = columns[0].toUpperCase();
            const endpoint = columns[4];
            const processInfo = columns.slice(6).join(' ');
            const portMatch = endpoint.match(/:(\d+)$/);
            const processMatch = processInfo.match(/users:\(\("([^"\\]+)",pid=(\d+)/);
            if (!portMatch || !processMatch)
                continue;

            const port = portMatch[1];
            const pid = processMatch[2];
            const process = processMatch[1];
            const address = endpoint.slice(0, endpoint.length - portMatch[0].length) || '*';
            const key = `${protocol}|${address}|${port}|${pid}`;
            if (seen.has(key))
                continue;
            seen.add(key);

            ports.push({
                protocol,
                port,
                address,
                pid,
                process,
                user: users.get(pid) || 'desconocido',
            });
        }

        return ports.sort((a, b) => Number(a.port) - Number(b.port));
    }

    _render() {
        this._content.removeAll();
        this._header.label.text = 'Kill All Processes';

        if (this._ports.length === 0) {
            this._setContentMessage('No hay puertos escuchando');
            return;
        }

        for (const port of this._ports)
            this._content.addMenuItem(new PortRow(port, item => this._kill(item)));
    }

    _setContentMessage(message) {
        this._content.removeAll();
        this._content.addMenuItem(new PopupMenu.PopupMenuItem(message, {reactive: false}));
    }

    _kill(port) {
        const dialog = new ModalDialog.ModalDialog({styleClass: 'linuxports-confirm-dialog'});
        const message = new St.Label({
            text: `¿Matar ${port.process} (PID ${port.pid})?\n\nEl proceso recibirá SIGTERM.`, 
            style_class: 'linuxports-confirm-message',
        });
        dialog.contentLayout.add_child(message);
        dialog.setButtons([
            {
                label: 'Cancelar',
                action: () => dialog.close(),
                key: Clutter.KEY_Escape,
            },
            {
                label: 'Matar',
                action: () => {
                    dialog.close();
                    this._terminate(port);
                },
                key: Clutter.KEY_Return,
            },
        ]);
        dialog.open();
    }

    _terminate(port) {
        const subprocess = Gio.Subprocess.new(
            ['kill', '-TERM', port.pid],
            Gio.SubprocessFlags.STDERR_PIPE,
        );
        subprocess.communicate_utf8_async(null, null, (process, result) => {
            try {
                const [, , stderr] = process.communicate_utf8_finish(result);
                if (!process.get_successful()) {
                    Main.notify('LinuxPorts', stderr?.trim() || `No se pudo terminar el PID ${port.pid}`);
                    return;
                }
                Main.notify('LinuxPorts', `PID ${port.pid} (${port.process}) terminado`);
                this._refresh();
            } catch (error) {
                Main.notify('LinuxPorts', `Error al terminar el PID ${port.pid}: ${error.message}`);
            }
        });
    }

    destroy() {
        if (this._refreshTimeout) {
            GLib.source_remove(this._refreshTimeout);
            this._refreshTimeout = 0;
        }
        super.destroy();
    }
});

export default class LinuxPortsExtension {
    enable() {
        this._indicator = new LinuxPortsIndicator();
        Main.panel.addToStatusArea('linuxports', this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
