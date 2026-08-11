use crate::state::Position;

const PROMPT_TEMPLATE: &str = include_str!("prompt.md");

pub fn build_prompt(positions: &[Position]) -> String {
    let positions_text = format_positions(positions);
    PROMPT_TEMPLATE.replace("{positions}", &positions_text)
}

fn format_positions(positions: &[Position]) -> String {
    let mut lines = Vec::new();

    for pos in positions {
        let notional = pos.entry_price * pos.qty;
        lines.push(format!(
            "- {}: {} {} @ ${:.2}, mark ${:.2}, P&L ${:+.2} (notional ${:.2})",
            pos.symbol,
            match pos.side {
                crate::state::Side::Long => "LONG",
                crate::state::Side::Short => "SHORT",
            },
            pos.qty,
            pos.entry_price,
            pos.mark_price,
            pos.unrealized_pnl,
            notional
        ));
    }

    if lines.is_empty() {
        "No open positions".to_string()
    } else {
        lines.join("\n")
    }
}
