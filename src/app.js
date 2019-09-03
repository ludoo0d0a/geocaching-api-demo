import express from 'express';
import passport from 'passport';
import morgan from 'morgan';
import session from 'express-session';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import methodOverride from 'method-override';
import expressLayouts from 'express-ejs-layouts';

import config from './config/config-api';

import {Strategy as RememberMeStrategy} from 'passport-remember-me'
import GeocachingStrategy from 'passport-geocaching'

// npm link issue with Babel7, so copy src in lib
//import GeocachingApi from './lib/src/geocaching-api';
import GeocachingApi from 'geocaching-api';
import { Geocache } from 'geocaching-api/dist/Api-v10';

const port = process.env.PORT || 3000;
const host = process.env.IP || 'localhost';
const cookie_name =  'remember_me';

// TODO : To remove from call
var apiVersion = '1'; 

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
  // application specific logging, throwing an error, or other logic here
});

// const GEOCACHING_APP_ID = config.clientID || "--insert-geocaching-app-id-here--"
// const GEOCACHING_APP_SECRET = config.clientSecret || "--insert-geocaching-app-secret-here--";
// const callbackURL = config.callbackURL || 'http://localhost:'+port+'/auth/callback';

// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.  However, since this example does not
//   have a database of user records, the complete Geocaching profile is serialized
//   and deserialized.
passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

const api = new GeocachingApi(config);

// Use the GeocachingStrategy within GeocachingApi for Passsport.
//TODO : can be better
api.strategy = new GeocachingStrategy(config, api._verify.bind(api));

passport.use(api.strategy);

// Use the GeocachingStrategy within Passport.
//   Strategies in Passport require a `verify` function, which accept
//   credentials (in this case, an accessToken, refreshToken, and Geocaching
//   profile), and invoke a callback with a user object.
// passport.use(
//   new GeocachingStrategy({
//     clientID: GEOCACHING_APP_ID,
//     clientSecret: GEOCACHING_APP_SECRET,
//     //You can skip profile request access
//     //skipUserProfile: true,
//     callbackURL: callbackURL
//   }  ,
//   function(accessToken, refreshToken, profile, done) {
//     //returns accesstoken to be displayed
//     profile.token = accessToken;
//     api.setAuth(accessToken);
    
//     // asynchronous verification, for effect...
//     process.nextTick(function () {
      
//       // To keep the example simple, the user's Geocaching profile is returned to
//       // represent the logged-in user.  In a typical application, you would want
//       // to associate the Geocaching account with a user record in your database,
//       // and return that user instead.
//       return done(null, profile);
//     });
//   }
// ));

// Remember Me cookie strategy
//   This strategy consumes a remember me token, supplying the user the
//   token was originally issued to.  The token is single-use, so a new
//   token is then issued to replace it.
passport.use(new RememberMeStrategy(
  function(userCookie, done) {
    if (userCookie && userCookie.token){
      console.log('Load user me (2)')
      api.setAuth(userCookie.token);
      // Reload user from cookie
      return api.getYourUserProfile().then(user => {
        user.storage = 'I read token from cookie and load user from API'
        done(null, user);
      }).catch(err =>{
        // cookie will be cleared
        done(null, false);
      })
    }else{
      // cookie will be cleared
      return done(null, false);
    }
  },
  function(user, done) {
    // Save some props of the user in the cookie
    const userToSaveInCookie = {
      ...user,
      storage: 'I will be saved in a cookie'
    } 
    return done(null, userToSaveInCookie);
  }
));

// if (config.token){
//   // Token is already know at startup
//   api.setAuth(config.token);
//   console.log('Load user me (1)')
//   api.getYourUserProfile().then(user => {
//       user.storage = 'Token was saved in DB/config on server, and user is retrieved at startup from API'
//       // TODO : Load token from server don' work
//       // req.login(user);
//       // api.strategy._verify(user);
//   }).catch(err => {
//     console.error('Error', err);
//   })
// }

var app = express();

// configure Express
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.use(morgan('combined'))
app.use(cookieParser());
app.use(bodyParser.json());

app.use(methodOverride());
app.use(session({ 
  secret: 'FTFGeocache:)',
  resave: false,
  saveUninitialized: true
}));

// Initialize Passport!  Also use passport.session() middleware, to support
// persistent login sessions (recommended).
app.use(passport.initialize());
app.use(passport.session());
app.use(passport.authenticate('remember-me'));
app.use(express.static(__dirname + '/public'));

app.get('/', function(req, res){
    var token = api.oauth_token || '{Undefined}';
    res.render('index', { user: req.user, token: token });
});

app.get('/account', ensureAuthenticated, function(req, res){
  res.render('account', { 
    user: req.user, 
    api: api, 
    oauth: api._tokens || {}, 
    token: req.token || (req.user && req.user.token) || '?' 
  });
  // res.render('account', { user: req.user });
});

app.get('/test', ensureAuthenticated, function(req, res) {
    if (api) {
        console.log('Load user me (3)')
        let data = '',
            error = '',
            token = api.oauth_token || '{Undefined}';
        api.getYourUserProfile().then(user => {
            user.storage = 'I come from API'
            data = JSON.stringify({ user });
            res.render('test', { user: serializeTojson(user) , token: token, data: data, error: error });
        }).catch(err =>{
          error = JSON.stringify(err);
          user = { homeCoordinates: {}}
          res.render('test', { user: serializeTojson(user) , token: token, data: data, error: err });
        });
    }
});

app.get('/queries', ensureAuthenticated, function(req, res) {
    if (api) {
        const referenceCode = 'GCK25B';
        const lite=false;
        const expand=false;
        let fields = api.getFields(new Geocache);
        const requiredFields = 'referenceCode,name,difficulty,terrain,favoritePoints,trackableCount,placedDate,geocacheType,geocacheSize,status,location,lastVisitedDate,ownerCode,ownerAlias,shortDescription,longDescription,findCount';
        api.GeocachesApi().geocachesGetGeocache(referenceCode, api.apiVersion, { lite, expand, fields }).then(geocache => {
            res.render('queries', { user: req.user, geocache: geocache || {}, error: '' });
        }).catch(err => {
          console.error('Cannot get queries', err);
          res.render('queries', { user: req.user, geocache: {}, error: err || '' });
        });
    }
});

app.get('/login', function(req, res){
  res.render('login', { user: req.user });
});

// GET /auth/geocaching
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in Geocaching authentication will involve
//   redirecting the user to geocaching.com.  After authorization, Geocaching will
//   redirect the user back to this application at /auth/callback
app.get('/auth/geocaching',
  passport.authenticate('geocaching'),
  function(req, res){
    // The request will be redirected to Geocaching for authentication, so this
    // function will not be called.
    if (req.params.rememberme){
      // TODO: Pass remember-me as option
    }
  });

// GET /auth/callback
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page.
//
// Be ware tht this url should now be prooperl registered by Groundspeak. Please contact support to add this url.
// A error message will occured if not properly set : The partner application did not give a secure redirect_uri. Please verify with the application the redirect uri is set up correctly and securely.
//
app.get('/auth/callback', 
  passport.authenticate('geocaching', { failureRedirect: '/login' }),
  function(req, res) {
    // save a subset of the user profile in cookie (needs to be reloaded in fact)
    const user = { 
      username: req.user.username,
      id: req.user.id,
      token: api.oauth_token // req.user.token,
    }
    res.cookie(cookie_name, user, { path: '/', httpOnly: true, maxAge: 604800000 });
    res.redirect('/');
  });

app.get('/logout', function(req, res){
  res.clearCookie(cookie_name);
  req.logout();
  res.redirect('/');
});

app.listen(port, function() {
    console.log('Example app for geocaching-api is listening on http://%s:%d', host, port);
});


// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  Otherwise, the user will be redirected to the
//   login page.
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/login')
}

/** 
 * Tip to serialize properly inner objects like homeCoordinates
 * */
function serializeTojson(o) {
    return JSON.parse(JSON.stringify(o));
}