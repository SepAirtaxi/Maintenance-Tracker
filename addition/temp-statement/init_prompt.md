Temporary Maintenance Statement generator:

When working as a CAMO in a Part-145 org., I have to issue a temporary maintenance statement after aircraft has finished scheduled inspections. These statements are usually good for 25 flight hours or 30 days, which allows the aircraft to legally fly in the span between finalizing inspections and finalizing the CAMO paperwork.

Once the CAMO (me) has finalized the work order documents I will issue a real maintenance statement, but that's not important in this context.

To make a temporary maintenance statement (TMS), I edit an old jank word template. It's hard to edit, the formatting is all over the place and it's just bad.

So I'd like your help to create a lightweight app (I'm thinking browser based), which let's you fill in some details and it will spit out a nicely and uniformly formatted PDF showing the information I need.

I've put a sample document in the root, called "TEMP MS Skabelon.docx", that's basically the form I need (although I want a more polished version). Worth noting is that the sample I've provided has too much data, so not everything needs to be included. But the tables and overall shape and firsthand impression of the document has to look the same.

Starting from the top rows, here's what they are and what I need:

Row 1: leftmost is a logo, and even the one in this template is outdated (and left aligned, should be center). I've put the new, current logo in root as "logo.png", please use the new logo and center align it. On the right side is the legal details on our maintenance organization. This should be the same 1-to-1 on the new app's output.

Row 2: Says "CAMO Maintenance Statement: OY-CAT TEMP Version". The tail number (OY-CAT) is one of the editable variants I want in the app. 

Row 3: Aircraft data; TTAF (total time air frame) and total landings (cycles), the TTAF and landings of the aircraft on the time of entering (these should also be editable variants). The print date should be automatic.
Next due: this is the most crucial point, as this is what flight operations use to plan the use of the fleet, and where they can see the next due in TTAF/date/landings. It's set up in an invisible table that you need to mimic so the data is displayed in the same fashion. I'll put pointers for each cell below:

Type/description/due: These are the column titles.
Hours/Calendar/Cycles: These are indicators of the rightmost values. These stay unchanged and fixed.
Inspection/Component/AD/SB: These are also just fixed titles explaining the type of event being called out on the next due.
TEMP/TEMP/TEMP: This would usually say something like "50 hour inspection", "Replace battery" and "Lycoming SB 366C". But in the case of a temp statement, they SHOULD all say "TEMP" like they do, so this doesn't need changing.
TTAF +25/d.d. +30/ ldgs +100: These are the mission critical values that I have to manually change everytime to make the statement.
These should be 3 editable fields in the app:
- TTAF +25: This should be a free text field to enter numbers (this is the validity of the TMS in flight hours), or a checkbox to tick off, which will automatically add 25 hours to the previously entered TTAF. Manual values are also an option, but 25 hours addition is the most commonly used.
- d.d. +30: Same concept as the TTAF, but with dates. The standard practice is to add 30 days (make a checkbox for this), but manual date picking should also be an option.
- ldgs + 100: this is the least important of the three as we dont measure any compliance event by cycles or landings, but same concept: tick off a box and it add 100 landings to the previously entered landings. Or a field for a manual value.

Row 4: This is the Note field. In this case it has a lot of useless engine/propeller notes, disregard those. It's just a note field, so make that in the app too so I can enter a note if necessary.

Row 5: This is also mission critical. The text is fixed, except for the XXXX referring to the related work order number. This should be a fillable field in the app (4-digit integer). At the bottom is the red text that says "Mentioned work order has bee released...", and then there's an underline. This is because the document is printed, and the mechanic will write the logbook number with a pen and place the document in the aircraft.


So I hope you get the idea of what I need: a fast and polished app to spit out these TMS'es. The vibe of the output PDF needs to stay the same, but bring it to the 21st century.