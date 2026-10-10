# Synthetic operations fixture

All data is invented for this demonstration. Revenue is USD; this is an operations example, not a banking dataset. One record represents reported revenue for a location on a date.

CSV must contain exactly `date,location_id,region,revenue,operating_start,operating_end`. Dates use real ISO calendar dates. Empty operating_end means still operating. Revenue is a signed decimal with at most two decimal places. Missing revenue, duplicate location/date pairs, conflicting location metadata, rows outside the operating period, and invalid dates are rejected. Limits: 1 MB, 5,000 rows, 50 regions.

The latest quarter with data is compared to its immediately preceding quarter; both must have records. Missing location revenue records are not imputed. A location with no revenue in one selected period contributes zero reported revenue for that period. Operating coverage is metadata, not proof that every daily revenue record exists.

## Checkable totals

| Region    |      Q1 all |      Q2 all |   Q1 common |   Q2 common |
| --------- | ----------: | ----------: | ----------: | ----------: |
| North     |      30,000 |      36,000 |      30,000 |      36,000 |
| South     |      26,000 |      78,000 |      24,000 |      18,000 |
| East      |      18,000 |      30,000 |      18,000 |      30,000 |
| West      |      21,000 |      22,500 |      21,000 |      22,500 |
| Central   |      39,000 |      37,500 |      33,000 |      34,500 |
| **Total** | **134,000** | **204,000** | **126,000** | **141,000** |

All-location change: `(204000 - 134000) / 134000 * 100 = 52.2388%`. South leads by $52,000. Common-location change: `(141000 - 126000) / 126000 * 100 = 11.9048%`. East leads by $12,000. Display rounds percentages to one decimal.

Common means `operating_start <= 2026-01-01` and `operating_end IS NULL OR operating_end >= 2026-06-30`. S2 opened March 15; C2 closed May 15. Both have revenue in both quarters yet are excluded. The remaining 5 locations contribute 30 rows. The top-three ranking is East, North, South, using absolute dollar change and alphabetical tie-breaking. Totals cover all eligible regions even when only three are displayed.

Local aggregation uses integer cents. Databricks uses DECIMAL(18,2). A zero previous total produces an undefined percentage, never infinity or invented growth. Negative previous revenue uses its absolute value as the denominator, explicitly shown in the formula.
