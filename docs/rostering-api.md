# Flight Standards rostering API

A read-only feed of every crew member's competency and recency dates. Flight
Standards is the system of record; the rostering software reads from it and never
writes back.

## Connection

- **URL:** `https://loft-records-backend.onrender.com/api/rostering/competencies`
- **Method:** `GET`
- **Authentication:** send the API key in a header, either
  - `X-API-Key: <key>`, or
  - `Authorization: Bearer <key>`
- **Format:** JSON (or CSV with `?format=csv`). HTTPS only.

The key opens this one read-only endpoint and nothing else.

## Options (all optional)

| Query | Effect |
| --- | --- |
| `type=PILOT` or `type=CABIN_ATTENDANT` | only that kind of crew |
| `arn=123456` | only the pilot with that ARN |
| `crewMemberId=<uuid>` | only that person |
| `format=csv` | CSV instead of JSON |

## Response

```json
{
  "generatedAt": "2026-11-21T03:15:00.000Z",
  "count": 1,
  "items": [
    {
      "crewMemberId": "5d3c0b52-...",
      "name": "Jane Citizen",
      "arn": "123456",
      "type": "PILOT",
      "fleets": ["DASH_8"],
      "competency": "Line Check - Dash 8",
      "code": "LINECHK",
      "codeIsSet": true,
      "completedDate": "2026-03-04",
      "dueDate": "2027-03-31",
      "status": "ok",
      "plannedDate": null,
      "reason": null
    }
  ]
}
```

One row per person per competency. Dates are `YYYY-MM-DD` (never `dd/mm/yyyy`).

| Field | Meaning |
| --- | --- |
| `crewMemberId` | Stable ID of the crew record. `null` for the Flight Standards staff competencies (Ground Instructor, Flight Standards Personnel Competency Check) |
| `arn` | Pilots only. **Cabin attendants have no ARN** (`null`) - match them on `crewMemberId` or name |
| `type` | `PILOT` or `CABIN_ATTENDANT` |
| `fleets` | `DASH_8`, `FOKKER_100`, `METRO_23`, `CA_DASH_8`, `CA_FOKKER_100` |
| `competency` | Exact competency name |
| `code` | The 7-character rostering code. If `codeIsSet` is `false` it is a stand-in, not a real code |
| `completedDate` | Last completion, or `null` |
| `dueDate` | When it expires, or `null` |
| `status` | `ok` (in date), `approaching`, `due_soon`, `important`, `overdue` (past due), `not_completed` (never done), `in_training` |
| `plannedDate` / `reason` | Planned re-check date and the note explaining an overdue item, if any |

The same rows, names and codes as the Currency Overview CSV export.

## Errors

- `401` - missing or wrong key
- `503` - the API has not been switched on (no key set on the server)
- `400` - a bad `type` value

## Suggested use

Fetch the whole feed on a schedule (e.g. every hour or each night) and replace the
rostering system's copy of the dates. It is small enough to pull in one request.
