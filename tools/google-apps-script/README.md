# Google Apps Script Endpoints

These scripts are the backend companions for the volunteer and endorsement forms in `index.html`.

## Files

- `volunteer-endpoint.gs` handles volunteer signups only.
- `endorsement-endpoint.gs` handles endorsement submissions only.

Use separate Apps Script projects and separate spreadsheets for each workflow.

## Recommended setup

1. Create one Google Spreadsheet for volunteer submissions.
2. Create one Google Spreadsheet for endorsement submissions.
3. In the volunteer spreadsheet, create a sheet named `Volunteer Submissions`.
4. In the endorsement spreadsheet, create a sheet named `Endorsement Submissions`.
5. Copy `volunteer-endpoint.gs` into the volunteer Apps Script project.
6. Copy `endorsement-endpoint.gs` into the endorsement Apps Script project.
7. Update the `notifyEmail` value in each script.
8. If the script is not spreadsheet-bound, set `spreadsheetId` in the `CONFIG` object to the target spreadsheet ID.
9. Run `testVolunteerWrite()` or `testEndorsementWrite()` once from the Apps Script editor to verify write access before deploying.
10. Deploy each project as a web app with access set to `Anyone`.
11. Paste the volunteer and endorsement web app URLs into the `siteConfig` object in `index.html`.

## Volunteer sheet header

Use this header row in the volunteer spreadsheet:

`submitted_at,name,email,volunteer_areas,message,source_page,locale,honeypot_status`

## Endorsement sheet header

Use this header row in the endorsement spreadsheet:

`submitted_at,endorsement_mode,name,secondary_label,secondary_value,email,message,review_status,source_page,locale,honeypot_status`

`review_status` should start as `pending` for all new entries.

## Frontend payload contract

Volunteer submissions send:

`type`, `name`, `email`, `volunteer_areas`, `message`, `source_page`, `locale`, `honeypot`, `submitted_at`

Endorsement submissions send:

`type`, `endorsement_mode`, `name`, `secondary_label`, `secondary_value`, `email`, `message`, `review_status`, `source_page`, `locale`, `honeypot`, `submitted_at`

## Notes

- The frontend sends `text/plain` with a JSON string body to avoid unnecessary CORS preflight behavior.
- Honeypot submissions are rejected and not written to either sheet.
- Keep endorsement spreadsheets private and use them as a review queue only.
- The site-side endpoint configuration lives in `index.html` in the `siteConfig` object.
- During setup, `debugErrors: true` returns the Apps Script error message in the JSON response. Turn it off after deployment if you do not want setup details exposed.