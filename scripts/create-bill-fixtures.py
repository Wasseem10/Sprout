from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor

root = Path('data/bills')
root.mkdir(parents=True, exist_ok=True)
for month, kwh, energy, total in [('2026-08', 900, 135, 195), ('2026-09', 1200, 180, 240)]:
    c = canvas.Canvas(str(root / f'insight-sample-electricity-{month}.pdf'), pagesize=(612, 792))
    c.setTitle(f'InsightOS sample electricity bill {month}')
    c.setFillColor(HexColor('#f2f6fb')); c.rect(0, 0, 612, 792, fill=1, stroke=0)
    c.setFillColor(HexColor('#173b68')); c.rect(0, 644, 612, 148, fill=1, stroke=0)
    c.setFillColor(HexColor('#ffffff')); c.setFont('Helvetica-Bold', 24)
    c.drawString(44, 731, 'Electricity statement')
    c.setFont('Helvetica', 11); c.drawString(44, 705, 'InsightOS demo utility | Orlando, Florida')
    c.drawString(44, 675, 'SYNTHETIC DEMO - FICTIONAL HOUSEHOLD')
    c.setFillColor(HexColor('#18334f')); c.setFont('Helvetica-Bold', 13)
    c.drawString(44, 598, 'Your current electricity charges')
    rows = [('Billing month', month), ('Billing days', '30'), ('Electricity used', f'{kwh:,} kWh'),
            ('Energy charges', f'${energy:.2f}'), ('Other current charges', '$60.00'), ('Current bill total', f'${total:.2f}')]
    y = 553
    for label, value in rows:
        c.setFont('Helvetica', 12); c.drawString(44, y, label + ':')
        c.setFont('Helvetica-Bold', 13); c.drawRightString(564, y, value)
        c.setStrokeColor(HexColor('#d7e0ed')); c.line(44, y-13, 564, y-13)
        y -= 46
    c.setFont('Helvetica', 10); c.drawString(44, 205, 'Other current charges: fixed service fee and taxes, grouped for this demo.')
    c.drawString(44, 186, 'Effective energy rate: $0.15 per kWh. No previous balance or other services.')
    c.drawString(44, 148, 'This is a test document, not an OUC bill or an actual customer account.')
    c.drawString(44, 129, 'No real utility pricing, customer data, or measured energy savings are represented.')
    c.setFont('Helvetica', 9); c.drawString(44, 48, 'Generated for accessible document comparison | Page 1 of 1')
    c.save()
