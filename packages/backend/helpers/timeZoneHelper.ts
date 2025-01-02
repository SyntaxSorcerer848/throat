var getFormattedDate = (inputDate: string) => {
    var dateObj = new Date(inputDate);

    // Extract year, month, and day
    var year = dateObj.getFullYear();
    var month = String(dateObj.getMonth() + 1).padStart(2, '0'); // Adding 1 because months are zero-indexed
    var day = String(dateObj.getDate()).padStart(2, '0');

    // Format the date as "YYYY-MM-DD"
    var formattedDate = `${year}-${month}-${day}`;

    return formattedDate;
};

var getDuration = (startDateTime: string, endDateTime: string) => {
    var startDate = new Date(startDateTime).getTime();
    var endDate = new Date(endDateTime).getTime();

    // Calculate the absolute difference in milliseconds
    var durationMs = Math.abs(endDate - startDate);

    // Convert milliseconds to hours and minutes
    var hours = Math.floor(durationMs / (1000 * 60 * 60));
    var minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

    // Format the duration as "HH:MM"
    var formattedDuration = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

    return formattedDuration;
};

var convertToHHMMInUTC = (dateTimeString: string) => {
    var date = new Date(dateTimeString);

    // Get hours and minutes in UTC format
    var hoursUTC = date.getUTCHours().toString().padStart(2, '0');
    var minutesUTC = date.getUTCMinutes().toString().padStart(2, '0');

    // Format the time as "HH:MM"
    var formattedTimeUTC = `${hoursUTC}:${minutesUTC}`;

    return formattedTimeUTC;
};

var getCurrentLocale = () => {
    var dateTimeFormat = new Intl.DateTimeFormat();
    var options = dateTimeFormat.resolvedOptions();
    return options.locale;
};

var getDateWithShortMonth = () => {
    var today = new Date();
    var formattedDate = today.toLocaleDateString(getCurrentLocale(), { day: 'numeric', month: 'short' });
    return formattedDate;
};

function getLastSevenDays() {
    var daysArray = [];
    var today = new Date();

    for (let i = 6; i > -1; --i) {
        var currentDate = new Date();
        currentDate.setDate(today.getDate() - i);

        // Formatting the date in form:  "22 Jan"
        var formattedDate = currentDate.toLocaleDateString(getCurrentLocale(), { day: 'numeric', month: 'short' });

        daysArray.push(formattedDate);
    }

    return daysArray;
}

export { convertToHHMMInUTC, getDuration, getFormattedDate, getDateWithShortMonth, getLastSevenDays };
