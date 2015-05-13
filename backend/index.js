var InnoHelper  = require('innometrics-helper'),
    bodyParser  = require('body-parser'),
    express     = require('express'),
    util        = require('util'),
    twilio      = require('twilio');

var app = express();
    app.use(bodyParser.json());
    app.use(function (req, res, next) {
        res.header('Access-Control-Allow-Origin', '*');
        next();
    });


var config = {
    groupId: '208',
    bucketName: 'egor',
    appName: 'egor-test_twilio-sms',
    appKey: '7OyW60ueA9sn8TTn',
    apiUrl: 'http://staging.innomdc.com',
    noCache: true
};

var inno    = new InnoHelper(config);
var tclient = null;


app.post('/', function(req) {
    getSettings(function(err, settings){
        if (err) { throw err; }
        inno.getProfile(req.body, function(err, data){
            if (err) { throw err; }
            if (settings.triggerEvent === data.event.definitionId) {
                sendSms(settings, data, function(err, message){
                    if (err) { throw err; }
                    console.log("Message was send to " + message.to + ", status: " + message.status + ", text: " + message.body);
                });
            }
        });
    });
});

var sendSms = function(settings, data, callback) {

    // init twilio client
    tclient = new twilio(settings.twilioSid, settings.twilioToken);

    // get user data
    getUserDetails({
        profileId:  data.profile.id,
        section:    data.session.section,
        nameAttr:   settings.contactNameAttribute,
        phoneAttr:  settings.contactPhoneAttribute
    }, function(err, user){
        if (err) { throw err; }

        var message = {
            body: util.format(settings.messageFormat, user.name),
            from: settings.twilioFrom,
            to: user.phone
        };

        tclient.messages.create(message, function(err, message) {

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

var getSettings = function(callback) {
    inno.getAppSettings(function(err, settings){

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

var getUserDetails = function(opts, callback) {
    inno.getProfileAttributes(opts, function(err, attributes){
        var user = null;

        if (!err) {
            attributes = attributes.filter(function(attr){
                return attr.section === opts.section && attr.data[opts.nameAttr] && attr.data[opts.phoneAttr];
            });

            if (attributes.length) {
                user = {
                    name: attributes[0].data[opts.nameAttr],
                    phone: attributes[0].data[opts.phoneAttr]
                };
            } else {
                err = new Error('User not found');
            }
        }
        
        callback(err, user);
    });
};


var server = app.listen(3333, function () {
    console.log('Listening on port %d', server.address().port);
});