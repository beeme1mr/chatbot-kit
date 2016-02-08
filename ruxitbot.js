/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

,-.----.                                              ___     
\    /  \                                 ,--,      ,--.'|_   
;   :    \           ,--,               ,--.'|      |  | :,'  
|   | .\ :         ,'_ /|   ,--,  ,--,  |  |,       :  : ' :  
.   : |: |    .--. |  | :   |'. \/ .`|  `--'_     .;__,'  /   
|   |  \ :  ,'_ /| :  . |   '  \/  / ;  ,' ,'|    |  |   |    
|   : .  /  |  ' | |  . .    \  \.' /   '  | |    :__,'| :    
;   | |  \  |  | ' |  | |     \  ;  ;   |  | :      '  : |__  
|   | ;\  \ :  | : ;  ; |    / \  \  \  '  : |__    |  | '.'| 
:   ' | \.' '  :  `--'   \ ./__;   ;  \ |  | '.'|   ;  :    ; 
:   : :-'   :  ,      .-./ |   :/\  \ ; ;  :    ;   |  ,   /  
|   |.'      `--`----'     `---'  `--`  |  ,   /     ---`-'   
`---'                                    ---`-'               

This is a sample Slack bot built with Botkit that enables users
to dialog with the Ruxit intelligent full stack APM monitoring system.

# RUN THE BOT:

  Get a Bot token from Slack:

    -> http://my.slack.com/services/new/bot

  Get a Ruxit API access token from:
    
	-> https://my.live.ruxit.com/#settings/integration/apikeys
	
  Run your bot from the command line:

    token=<MY TOKEN> rxenv=<MY RUXIT ENV> rxkey=<MY RUXIT API KEY> node ruxitbot.js

# USE THE BOT:

  Find your bot inside Slack to send it a direct message.

  Say: "whats the status of my applications"

  Ruxit will hopefully reply "Everything is running fine!"

  Read all about it here:

    -> http://howdy.ai/botkit

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/


if (!process.env.token) {
    console.log('Error: Specify Slack API token in environment');
    process.exit(1);
}

if (!process.env.rxkey) {
	console.log('Error: Specify your Ruxit API key in environment');
    process.exit(1);
}

if (!process.env.rxenv) {
	console.log('Error: Specify your Ruxit environment identifier in environment');
    process.exit(1);
}


var rxcluster = "live.ruxit.com";
var rxkey = process.env.rxkey;
var rxenv = process.env.rxenv;

var Botkit = require('Botkit');
var os = require('os');
var https = require('https');

var controller = Botkit.slackbot({
    debug: false,
});

var bot = controller.spawn({
    token: process.env.token
}).startRTM();

controller.hears(['status','going on','whats up'],'direct_message,direct_mention,mention',function(bot, message) {
	bot.reply(message,'Ok wait, i will check for you!');
	
    var options = {
		host: rxenv + '.' + rxcluster,
		path: '/api/v1/problem/status?Api-Token=' + rxkey,
		method: 'GET'
	};

	var req = https.request(options, function(res) {
		console.log(res.statusCode);
		res.on('data', function(d) {
			var status = JSON.parse(d);
			if(status.result.totalOpenProblemsCount == 0) {
				bot.reply(message,'Everything works fine, i can see no problem at the moment');
			}
			else {
				bot.reply(message,"Unfortunately, there are *" + status.result.totalOpenProblemsCount + " open problems*!");	
				if(status.result.openProblemCounts.APPLICATION > 0) {
					bot.reply(message,"" + status.result.openProblemCounts.APPLICATION + " of them have an impact on your applications");
				}
			}
		});
	});
	req.end();

	req.on('error', function(e) {
		bot.reply(message,'some error');
	});
});

controller.hears(['application', 'service', 'infrastructure'],'direct_message,direct_mention,mention',function(bot, message) {
	var impactType;
	if(message.text.indexOf('application') > -1) {
		impactType = 'application';
	}
	else if(message.text.indexOf('service') > -1) {
		impactType = 'service';
	}
	else {
		impactType = 'infrastructure';
	}
	
    var options = {
		host: rxenv + '.' + rxcluster,
		path: '/api/v1/problem/feed?impactLevel=' + impactType + '&status=OPEN&Api-Token=' + rxkey,
		method: 'GET'
	};

	var req = https.request(options, function(res) {
		console.log(res.statusCode);
		res.on('data', function(d) {
			var status = JSON.parse(d);
			if(status.result.problems.length == 1) {
				bot.reply(message,'I am following *' + status.result.problems.length + ' open problem* on ' + impactType + ' level');
			}
			else if(status.result.problems.length > 0) {
				bot.reply(message,'I am following *' + status.result.problems.length + ' open problems* on ' + impactType + ' level');
			}
			else {
				bot.reply(message,'I see no open problems on ' + impactType + ' level');
			}
			// give some details
			status.result.problems.forEach(function(problem) {
				bot.reply(message,'Problem ' + problem.displayName + ', has impact on:');
				problem.rankedImpacts.forEach(function(impact) {
					bot.reply(message,impact.impactLevel + ' ' + impact.entityName);
				});
			});
			
			
		});
	});
	req.end();

	req.on('error', function(e) {
		bot.reply(message,'some error');
	});
});

controller.hears(['problem (.*)'],'direct_message,direct_mention,mention,ambient',function(bot, message) {
    var matches = message.text.match(/problem (.*)/i);
    var problem = matches[1];
	
	controller.storage.users.get(message.user,function(err, user) {
		if (!user) {
			user = {
				id: message.user,
			};
		}
		user.problem = '' + problem;
		
		replyProblemDetails(bot, message, problem);
		
		controller.storage.users.save(user,function(err, id) {
			
		});
		
	});
	
});

controller.hears(['more'],'direct_message,direct_mention,mention',function(bot, message) {

    controller.storage.users.get(message.user,function(err, user) {
        if (user && user.problem) {
			// give user some problem details
			replyProblemDetails(bot, message, user.problem);
        }
    });
});

function replyProblemDetails(bot, message, problemNr) {
	var options = {
		host: rxenv + '.' + rxcluster,
		path: '/api/v1/problem/feed?Api-Token=' + rxkey,
		method: 'GET'
	};

	var req = https.request(options, function(res) {
		console.log(res.statusCode);
		res.on('data', function(d) {
			var status = JSON.parse(d);
			// get pid first
			status.result.problems.forEach(function(problem) {
				
				if(problem.displayName == problemNr) {
					// give some details
					bot.reply(message,'Problem ' + problem.displayName + ', has impact on:');
					problem.rankedImpacts.forEach(function(impact) {
						bot.reply(message,impact.impactLevel + ' ' + impact.entityName);
					});
				}
			});
			
			
		});
	});
	req.end();

	req.on('error', function(e) {
		bot.reply(message,'some error');
	});
}

controller.hears(['last','remind'],'direct_message,direct_mention,mention',function(bot, message) {

    controller.storage.users.get(message.user,function(err, user) {
        if (user && user.problem) {
            bot.reply(message,'Last time we were talking about problem ' + user.problem);
        } else {
            bot.reply(message,'Getting old, cant remember!');
        }
    });
});





