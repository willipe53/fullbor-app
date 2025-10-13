
# Current running position keeper id is:
# select pk.position_keeper_id from position_keepers pk
# join lambda_locks ll on pk.instance = ll.instance;
position_keeper_id = 12345

# All days from min to max inclusive
position_dates = [
    "2025-09-28",
    "2025-09-29",
    "2025-09-30",
    "2025-10-01",
    "2025-10-02",
    "2025-10-03",
    "2025-10-04",
    "2025-10-05",
    "2025-10-06",
    "2025-10-07",
    "2025-10-08",
    "2025-10-09",
    "2025-10-10",
    "2025-10-11"
]

# Trade Date and Settle Date
position_type_ids = [1, 2]

# All permutations of contra/instrument plus portfolio/instrument
entity_permutations = [
    [636, 635], [636, 632], [636, 30], [643, 30], [636, 29], [636, 28],
    [643, 27], [24, 30], [643, 26], [636, 637], [644, 339], [643, 77],
    [24, 635], [641, 635], [642, 632], [641, 637]
]

for position_date in position_dates:
    for entity_permutation in entity_permutations:
        portfolio_entity_id = entity_permutation[0]
        instrument_entity_id = entity_permutation[1]
        for position_type_id in position_type_ids:
            print(f"""
insert position_sandbox(
  position_date, position_type_id, portfolio_entity_id,
  instrument_entity_id, share_amount,
  market_value, position_keeper_id
) VALUES (
  {position_date}, {position_type_id}, {portfolio_entity_id},
  {instrument_entity_id}, 0,
  0, {position_keeper_id}
)""")
