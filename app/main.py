import argparse
import sys
import time
import os
from pathlib import Path

# Ensure project root is in sys.path
root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from app.config import ConfigManager
from app.tunnel_engine import TunnelEngine
from app.qr_generator import generate_ascii_qr
from app.inspector import RequestLog
from app.updater import APP_VERSION

try:
    from rich.console import Console
    from rich.panel import Panel
    from rich.table import Table
    from rich import print as rprint
    rich_available = True
except ImportError:
    rich_available = False


def run_cli_mode(args, config_mgr: ConfigManager):
    """Runs LLOOP in non-graphical terminal mode."""
    port = args.port
    provider = args.provider or config_mgr.get("default_engine", "serveo")

    # Determine Subdomain Mode & Slug
    if args.fixed:
        mode = "fixed"
        subdomain = args.subdomain or config_mgr.get_fixed_subdomain(port) or f"my-app-{port}"
    elif args.subdomain:
        mode = "custom"
        subdomain = args.subdomain
    elif args.random:
        mode = "random"
        subdomain = ""
    else:
        # Prompt user if not specified
        print("\n--- LLOOP Subdomain Mode ---")
        print("1. Use Fixed Subdomain (persists across restarts)")
        print("2. Enter Custom Subdomain")
        print("3. Random URL")
        choice = input("Select mode (1/2/3) [Default 1]: ").strip() or "1"

        if choice == "1":
            mode = "fixed"
            saved_sub = config_mgr.get_fixed_subdomain(port) or f"my-app-{port}"
            subdomain = input(f"Enter fixed subdomain slug [{saved_sub}]: ").strip() or saved_sub
        elif choice == "2":
            mode = "custom"
            subdomain = input("Enter custom subdomain slug: ").strip()
        else:
            mode = "random"
            subdomain = ""

    if mode == "fixed" and subdomain:
        config_mgr.set_fixed_subdomain(port, subdomain)

    print(f"\n[LLOOP] Starting tunnel for local port {port} using provider '{provider}'...")

    def on_status_change(status: str, url: str, error: str):
        if status == "CONNECTED":
            if rich_available:
                console = Console()
                qr_ascii = generate_ascii_qr(url)

                table = Table(title="⚡ LLOOP Connected Live", border_style="green")
                table.add_column("Property", style="cyan", justify="right")
                table.add_column("Value", style="bold white")

                table.add_row("Local Target", f"http://127.0.0.1:{port}")
                table.add_row("Public HTTPS URL", f"[bold underline green]{url}[/]")
                table.add_row("Subdomain Mode", f"{mode} ({subdomain if subdomain else 'random'})")
                table.add_row("Tunnel Engine", provider)
                table.add_row("Request Inspector", "Active")

                console.print("\n")
                console.print(table)
                console.print(Panel(qr_ascii, title="Scan with Mobile Camera", border_style="blue"))
                console.print("\n[bold yellow]Press Ctrl+C to stop the tunnel.[/bold yellow]\n")
            else:
                print("\n=======================================================")
                print(f"⚡ LLOOP CONNECTED LIVE!")
                print(f"Public HTTPS URL: {url}")
                print(f"Forwarding to:    http://127.0.0.1:{port}")
                print("=======================================================\n")

        elif status == "ERROR":
            print(f"\n[Error] {error}\n")

    def on_request_log(req: RequestLog):
        log_dict = req.to_dict()
        color = "green" if 200 <= req.response_status < 300 else "yellow" if req.response_status < 500 else "red"
        if rich_available:
            rprint(f"[{color}][{log_dict['timestamp']}] {log_dict['method']} {log_dict['path']} -> {log_dict['status']} ({log_dict['duration']})[/{color}]")
        else:
            print(f"[{log_dict['timestamp']}] {log_dict['method']} {log_dict['path']} -> {log_dict['status']} ({log_dict['duration']})")

    engine = TunnelEngine(
        local_port=port,
        subdomain=subdomain,
        mode=mode,
        provider=provider,
        enable_inspector=not args.no_inspector,
        on_status_change=on_status_change,
        on_request_log=on_request_log
    )

    try:
        engine.start()
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[LLOOP] Stopping tunnel...")
        engine.stop()
        print("[LLOOP] Goodbye!")


def main():
    parser = argparse.ArgumentParser(description="LLOOP - Zero-Config Localhost Tunneling with Fixed URLs")
    parser.add_argument("-p", "--port", type=int, help="Local port to expose (e.g. 3000, 8000)")
    parser.add_argument("-s", "--subdomain", type=str, help="Custom subdomain slug")
    parser.add_argument("-f", "--fixed", action="store_true", help="Use fixed persistent subdomain for the port")
    parser.add_argument("-r", "--random", action="store_true", help="Use a random subdomain")
    parser.add_argument("-e", "--provider", type=str, choices=["serveo", "pinggy", "localhost_run"], help="Tunnel engine provider")
    parser.add_argument("--no-inspector", action="store_true", help="Disable HTTP request inspector")
    parser.add_argument("--cli", action="store_true", help="Force CLI mode")
    parser.add_argument("--gui", action="store_true", help="Force GUI mode")

    args = parser.parse_args()
    config_mgr = ConfigManager()

    # Determine mode: GUI by default unless --cli or -p is specified
    if args.cli or (args.port is not None and not args.gui):
        if not args.port:
            try:
                port_str = input("Enter local port to expose (e.g. 3000): ").strip()
                args.port = int(port_str)
            except ValueError:
                print("Invalid port number.")
                sys.exit(1)
        run_cli_mode(args, config_mgr)
    else:
        # Run CustomTkinter GUI
        from app.gui import LloopGUI
        app = LloopGUI(config_mgr)
        app.mainloop()


if __name__ == "__main__":
    main()
