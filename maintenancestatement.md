Hey Claude. We need to evolve the Maintenance Statement module, as it now needs to be able to handle actual maintenance statements as well. The logic is basically the same, but there are a few differences.

At the top of the statement module view, I want to be able to toggle between actual and temporary statement. The temporary statement functions are not to be touched as that works as intended. Although I would like you to add one update in relation to the new implementation; The TTAF/Cycle fields should default to current TTAF/Cycles, and add a "Use current TTAF/Cycles" button for the TTAF and cycles field. Still with the option to edit if necesary.

For the actual statement, I need the following user input fields:
- Tail number
- Related WO number
- Current TTAF (defaults to the current TTAF pulled from Flightlogger. Include a "use current TTAF" button)
- Current Cycles (defaults to the current Cycles pulled from Flightlogger. Include a "use current cycles" button)
- Next due event TTAF. This should include a Text line (for explaining the event name), as well as a TTAF deadline entry field.
- Next due event by date. Same logic as above, except for inputting a date. DD-MM-YYYY format and include a date-picker feature. Final PDF output should state e.g. "Sep 17, 2026" instead of the DD-MM-YYYY.
- Next due event by cycles. Same logic. A field for entering the event name and its deadline cycle count.
- Optional note field.

For the actual maintenance statement, you must remove the "This is only a temporary maintenance statement"-statement, along with the signature line. This section should be entirely excluded from the actual maintenance statement.

Apart from this, the PDF output page should look as similar as possible to the already settled Temp output format.
So the end product should be almost the same as the temp statement, except this one shows actual deadlines and the name of the actual event (in the description column on the Next Due section.

