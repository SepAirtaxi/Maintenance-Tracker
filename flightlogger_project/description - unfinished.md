I want to rethink the import flight data function, as I don't see myself using it as I'm afraid that it will overwrite or mess up user entered data. The import feature was one of the first things implemented, and I basically haven't used it.

I want to rethink the way we do this, because to boil it down I only really need the Tail no/TTAF data from flightlogger. I don't need event details as it was evidently generic event data that wasn't up to date.

So I hence need your help to work out a new way to exctract TTAF data. The only catch is that there is no way to export a report with this data (confirmed with the flightlogger dev team), so we'll have to be creative.

The issue is that it might be tricky to extract this data, considering I have to be logged in and the data is hidden inside this dynamic table. I need you to understand the structure and help me finding out how we can consistently and quickly extract this data going foward.

In \flightlogger_project\FlightLogger.html is a snapshot of the page. In this specific sample, the exact data I need is the tail number and the TTAF. TTAF is displayed as "Airborne" in flightlogger btw.

In this case I need a solution that matches tail numbers with the TTAF. Just to give you a good head start, the specific values 
for the specific snapshot in the project folder is as follows:

OY-HHG - 2460:10
OY-CDT - 3865:25
OY-CAH - 13658:22
OY-CDR - 5729:36
OY-CDJ - 9922:56
OY-CDL - 11945:47
OY-CDP - 6460:48
OY-CDU - 6282:01