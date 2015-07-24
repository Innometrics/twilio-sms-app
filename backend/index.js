var bodyParser  = require('body-parser'),
    express     = require('express'),
    util        = require('util'),
    inno = require('innometrics-helper'),
    twilio      = require('twilio');

var app = express();
app.use(bodyParser.json());
app.use(function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});

var vars = {
    bucketName: process.env.INNO_BUCKET_ID,
    appKey: process.env.INNO_APP_KEY,
    apiUrl: process.env.INNO_API_HOST,
    appName: process.env.INNO_APP_ID,
    groupId: process.env.INNO_COMPANY_ID
};

var innoHelper = new inno.InnoHelper(vars);

var tclient = null;


app.post('/', function (req) {

    getSettings(function (err, settings) {
        var profile,
            session,
            event;

        if (err) {
            throw err;
        }

        try {
            profile = innoHelper.getProfileFromRequest(req.body);
        } catch (e) {
            throw e;
        }

        session = profile.getLastSession();
        if (session) {
            event = session.getLastEvent();

            if (event && settings.triggerEvent === event.getDefinitionId()) {
                sendSms(settings, {
                    profileId: profile.getId(),
                    section: session.getSession()
                }, function (err, message) {
                    if (err) {
                        throw err;
                    }
                    console.log(util.format(
                        "Message was send to %s, status: %s, text: %s",
                        message.to,
                        message.status,
                        message.body
                    ));
                });
            }

        }

    });

});

var sendSms = function (settings, data, callback) {

    // init twilio client
    tclient = new twilio(settings.twilioSid, settings.twilioToken);

    // get user data
    getUserDetails({
        profileId:  data.profileId,
        section:    data.section,
        nameAttr:   settings.contactNameAttribute,
        phoneAttr:  settings.contactPhoneAttribute
    }, function (err, user) {
        if (err) {
            throw err;
        }

        var message = {
            body: util.format(settings.messageFormat, user.name),
            from: settings.twilioFrom,
            to: user.phone
        };

        tclient.messages.create(message, function (err, message) {

            if (err) {
                err = new Error(err.message);
            }

            if (!err && !(message && message.sid)) {
                err = new Error("Something went wrong during sending message");
            }

            callback(err, message);
        });
    });

};

var getSettings = function (callback) {
    innoHelper.getAppSettings(function (err, settings) {

        if (!err && !settings) {
            err = new Error('Failed to get settings from data handler');
        } else if (!settings.twilioSid || !settings.twilioToken) {
            err = new Error('Twilio credentials not found');
        } else if (!settings.messageFormat || !settings.twilioFrom) {
            err = new Error('Not enough parameters to send message (Message format or from number)');
        } else if (!settings.triggerEvent) {
            err = new Error('Trigger event not found');
        } else if (!settings.contactNameAttribute || !settings.contactPhoneAttribute) {
            err = new Error('Contact attribute codenames not found');
        }

        callback(err, settings);

    });
};

var getUserDetails = function (opts, callback) {
    innoHelper.loadProfile(opts.profileId, function (error, profile) {
        var user = null,
            attributes;

        if (!error) {
            user = {};
            attributes = profile.getAttributes(opts.nameAttr);
            attributes.forEach(function (attribute) {
                if (!user.name && attribute.getName() === opts.nameAttr && attribute.getValue()) {
                    user.name = attribute.getValue();
                    return;
                }

                if (!user.phone && attribute.getName() === opts.phoneAttr && attribute.getValue()) {
                    user.phone = attribute.getValue();
                }
            });

            if (!user.name || !user.phone) {
                error = new Error('User not found');
                user = null;
            }
        }

        callback(error, user);
    });
};


var server = app.listen(process.env.PORT, function () {
    console.log('Listening on port %d', server.address().port);
});