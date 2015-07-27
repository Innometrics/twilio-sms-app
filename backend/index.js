var bodyParser  = require('body-parser'),
    express     = require('express'),
    util        = require('util'),
    inno = require('innometrics-helper'),
    twilio      = require('twilio');

var env = process.env;

var vars = {
    bucketName: env.INNO_BUCKET_ID,
    appKey:     env.INNO_APP_KEY,
    apiUrl:     env.INNO_API_HOST,
    appName:    env.INNO_APP_ID,
    groupId:    env.INNO_COMPANY_ID
};

var innoHelper = new inno.InnoHelper(vars),
    twilioClient,
    app;

app = express();
app.use(bodyParser.json());
app.use(function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});

var errors = [],
    errorsLimit = 20;

function logError (error) {
    console.error();
    errors.push({
        date: new Date(),
        error: error
    });
    errors = errors.slice(-1 * errorsLimit);
}

app.get('/', function (req, res) {
    var data = 'I am Twilio SMS Application (https://github.com/Innometrics/twilio-sms-app)';
    res.send(data);
});

app.get('/errors', function (req, res) {
    var data = errors.map(function (record) {
        return util.format('%s: %s', record.date, record.error);
    }).join('\n\n');

    res.send(data || 'No errors');
});

/**
 * Handle request form DH (with ProfileStream data)
 */
app.post('/', function (req, res) {

    getSettings(function (err, settings) {
        var profile,
            session,
            event;

        if (!err) {
            try {
                profile = innoHelper.getProfileFromRequest(req.body);
            } catch (e) {
                err = e;
            }
        }

        if (err) {
            logError(err);
            return res.status(500).json({
                error: err
            });
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
                        logError(err);
                        return res.status(500).json({
                            error: err
                        });
                    }
                    var msg = util.format(
                        "Message was send to %s, status: %s, text: %s",
                        message.to,
                        message.status,
                        message.body
                    );
                    console.log(msg);
                    return res.json({
                        error: null,
                        result: msg
                    });
                });
            }

        }

    });

});

var sendSms = function (settings, data, callback) {

    // init twilio client
    twilioClient = new twilio(settings.twilioSid, settings.twilioToken);

    // get user data
    getUserDetails({
        profileId:  data.profileId,
        section:    data.section,
        nameAttr:   settings.contactNameAttribute,
        phoneAttr:  settings.contactPhoneAttribute
    }, function (err, user) {
        if (err) {
            return callback(err);
        }

        var message = {
            body: util.format(settings.messageFormat, user.name),
            from: settings.twilioFrom,
            to: user.phone
        };

        twilioClient.messages.create(message, function (err, message) {

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