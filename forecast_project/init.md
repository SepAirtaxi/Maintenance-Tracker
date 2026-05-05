I have an idea for a tool that will be a big help in my daily tasks. I don't know if it makes sense to incorporate this feature into the existing maintenance tracker, but if possible it would be nice for me to have all tools consolidated within one app.

The pain point:
Our current ERP is very outdated, it was hot shit when Windows XP was being used, so you can imagine it's not so hot anymore.
There is a lot of manual checking for due times and flight hours. The way we plan maintenance work today is by making a forecast.
The standard for the forecast is usually that we look 3 months and 100 flight hours ahead (subject to change) to see what events will be due within this timeframe. This generates a standardized MS Word document, and I have placed a sample of this report at \forecast_project\ForecastList-A16BA9E0-6DDD-4B49-8C9C-53AA1FE02416.doc\

How to approach it:
In the top table you can see "Created from the following values", and you can then see the forecasted date (august 5 2026) and flight hours (13758.2). With this information, you need to know the aircraft's current TTAF, which we conveniently already have logged in the Maintenance Tracker app.

We are interested in calling out scheduled maintenance well ahead of time so we can create a Work Order, as we consider being ahead of scheduled maintenance to be preferred.
Next thing to do is to look at the different tables with tasks (same as events) and when they're due.

Since we're working with scheduled maintenance, there's a hierarchy of importance, meaning that we will always scroll down to look at the "Inspections" table first. Let's use OY-CAH as an example. Its current TTAF is 13654:13, so we need to look at these fields in the "Inspections" table:

- Limit: This is the upper limit of the respective event, sometimes stated in months (M) and sometimes stated in flight hours (H). Unless stated in the event name, this limit cannot be exceeded if we want to keep the aircraft airworthy. We can always do it earlier, but it's a financial balancing act. The earlier we take them in before they're due, the more expensive the flight hours become. So we are always interested in hitting as close to the limit as possible.
- Perf.: This states when the specific event was last carried out. Usually flight hours will run out quicker than the months.
- TTSC: Not relevant for this operation, can be ignored for now.
- Due: This is the most important column, as this tells us when the aircraft will be grounded if the event isn't performed before then. In this spe
- Rem.: Time in months or flight hours until due.

Important to note is that the scheduled maintenance usually bounces between 50 hour inspections and 100 hour inspections (unless larger or annual inspections are called out), but due to the way our system is set up we will need to include both the 50 hour and the 100 hour inspection when the 100 hour inspection is due. The 100 hour inspection includes all the steps from the 50 hour one as well, but it isn't automatically applied to the work order, so the scheduled intervals are basically 50 HR, 50/100 HR, 50 HR, 50/100 HR and so on.

The "50 hour inspection cat practice" is mandatory for all scheduled maintenance as this is our own AMP Part-145 approved practice for inspection points outside the required checks.

Once the inspections have been determined, we look at the other tables;
- Components: List of components that are due for various tasks within the forecasted limit. In this case, OY-CAH needs replacement (rep) of the induction air filter and the vacuum relief filter. Their due time and last performed time is the exact same as the 100 hour inspection, so it's safe to assume that this needs to be called out on the WO.
- Tasks: List of tasks that we ourselves as a maintenance organization have called out, so they can differ wildly in scope. In this case, we have some deferred defects that requires continious surveillance and/or inspections; elevator aft trim drum and rudder lower bearing.
- AD's: These are the mandatory Airworthiness Directives called out by EASA or FAA, but also non-mandatory manufacturer issued Service Bullettins that we have decided to incorporate. It will state SB (service bullettin) or SL (service letter) or something like that if it's not an AD.
They have a "type" column, and they can either be initial, recurring or terminating actions. Usually we only see recurring ones.

My Desired Output:
I am looking for a feature that can quickly read and calculate what needs to be called out. I don't need an advanced algorhithm that calculates for me, more something like a calculator that has some parameters to work from, and gives me a list of the next up coming events. It also needs to highlight if some events are out of phase and will require my evaluation for when to take the aircraft in. Often events don't exactly line up hour/month wise, and the CAMO has to make a decision on how many flight hours to sacrifice.

Basically, the report I extract from our CAMO system is unintuitive and cluttered with data and what I need is a clear overview of upcoming events that needs to be handled correctly.


Disclaimer:
The data we're working with is oooold legacy data entered by different people through the years, so the event names may have different names or spellings depending on the aircraft, since the events are linked on airframe level (one level higher than tail number level). I suggest that I feed you a lot of training data, possibly for the entire fleet, so you can get a full overview and ask questions during development.