from typing import List, Dict, Any
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

console = Console()


def print_banner(text: str):
    console.print(Panel.fit(f"[bold green]{text}[/bold green]"))


def print_results_table(title: str, results: List[Dict[str, Any]], style_color: str = "cyan"):
    if not results:
        console.print("[yellow]No results to display.[/yellow]")
        return

    table = Table(title=title)
    headers = list(results[0].keys())

    for col in headers:
        table.add_column(col, justify="center", style=style_color, no_wrap=True)

    for row in results:
        table.add_row(*[str(val) for val in row.values()])

    console.print(table)