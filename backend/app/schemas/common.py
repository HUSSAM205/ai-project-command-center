from decimal import Decimal
from typing import Annotated

from pydantic import PlainSerializer

# Pydantic serializes `Decimal` to a JSON string by default (to avoid float precision
# surprises), but every numeric field in this API is consumed by a frontend whose TypeScript
# contract declares these as `number` (see frontend/lib/types.ts). Serializing as a string
# silently breaks client-side arithmetic (string concatenation instead of addition) rather
# than raising an error, so it must be fixed at the schema layer, not patched per-call-site.
# Use this type on every *Out schema field that holds a Decimal-backed money/hours value.
MoneyField = Annotated[Decimal, PlainSerializer(lambda v: float(v), return_type=float)]
