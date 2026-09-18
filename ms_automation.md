Automation of the (actual) maintenance statement:

Today, to issue a maintenance statement, we have to dig through all related compliance events for an aircraft to determine two things:
- What are the next upcoming events based on flight hours/date/cycles?
- If more than one event is being called out at the same time, which event has priority and should be shown on the statement?

I believe that this can be automated. We're currently migrating to a new ERP that doesn't have the function to output a maintenance statement, so it would be extremely helpful with a feature to do this.

We can extract what's called a "compliance report" for each aircraft, meaning a list of all associated compliance events and their due base and value. My hope is that we can make a function that automatically reads this multi-page PDF, and from the rules we establish, it will auto-poulate the actual maintenance statement fields.

1. User navigates to Maintenance Statement on the app.
2. User uploads specific compliance report from the ERP.
3. System knows how to read and prioritize the events on the PDF.
4. System generates a dialogue with an extended view of closely related events (see the forecasting feature on the app which does the same thing but from our old ERP's compliance report.) and auto-populates the fields with the event description and due base (TTAF hours, date or cycle), or it allows the user to select closely related events (this doesn't dismiss other events, it just lets the user prioritize which event should show up on the maintenance statement)
5. Click generate, happy user!

So if you skew over to the forecasting feature on the app, you can see some of the logic I'm about to explain.
The logic for TTAF due based events is that there are so called anchor points; these are the scheduled maintenance events, which usually goes back and forth between a 50 hour inspection or a 100 hour inspection, but occasionally a major/annual inspection comes in. Anyway, these scheduled events are the anchor points that are important to know. As an example, a 50 hour inspection will always be called out at the same time as a 100 hour inspection, since the 50H is a prerequisite to perform the 100H. But in an operational standpoint, it's more important that the statement shows that the plane is due for a 100H inspection, as this inspection takes 2 days as opposed to a 1 day 50H inspection. So it's more important that the 100H inspection gets priority and is shown first.

Anyway, this is just the initial prompt and we need to hone in on something that works. I've added "Aircraft status report.pdf" to the /sample/ folder so you can see how it's built. Note: we're in the midst of migrating ERP systems as of writing this, so the sample report is a bad example for other than learning the logic of the page setup. The events are pretty messy and I don't suspect that it's actually updated accordingly, just bear this in mind.