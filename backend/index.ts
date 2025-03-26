import Logging from "./lib/Logging.js";
import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import passport from 'passport';
import { Strategy as SteamStrategy } from 'passport-steam';
import session from 'express-session';
import crypto from 'crypto';

const FRONTEND_URL = process.env.FRONTEND_URL;
const BACKEND_URL = process.env.BACKEND_URL;


const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(cors({
    origin: FRONTEND_URL,
    credentials: true
}));

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

passport.use(new SteamStrategy({
    returnURL: BACKEND_URL + '/auth/steam/return',
    realm: BACKEND_URL,
    apiKey: process.env.STEAM_API_KEY,
},
    (identifier, profile, done) => {
        process.nextTick(() => {
            (profile as any).identifier = identifier;
            return done(null, profile);
        });
    }
));

app.use(session({
    secret: crypto.randomUUID(),
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Setze `true`, wenn HTTPS verwendet wird
}));

app.use(passport.initialize());
app.use(passport.session());

// Check if the user is already authenticated, or pass a token to bypass
app.get('/auth/login', (req, res, next) => {
    if (req.isAuthenticated()) {
        res.redirect(FRONTEND_URL);
        Logging.logInfo("/auth/login: " + (req as any).user.displayName + " (" + (req as any).user.id + ") ALREADY VERIFIED DIRECT ACCEPT");
        return;
    } else {
        // Redirect to Steam login if no session and no valid token
        return passport.authenticate('steam')(req, res, next);
    }
},
    passport.authenticate('steam'),
    (req, res) => {
        res.redirect(FRONTEND_URL);
    }
);

app.get('/auth/steam/return',
    passport.authenticate('steam'),
    (req, res) => {
        res.redirect(FRONTEND_URL);
        Logging.logInfo("/auth/steam/return: " + (req as any).user.displayName + " (" + (req as any).user.id + ")");
    }
);

app.get('/stats', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({
            "success": true, "stats": {
                username: (req as any).user.displayName,
                kills: 25,
                deaths: 153,
                experience: 20345,
                playtime: 30.3,
                leaderboardPositionHistory: [10, 5, 7, 2, 1],
                avatarFull: (req as any).user.photos[2].value,
                roundsPlayed: 670,
                level: 41,
                usedMedkits: 281,
                usedColas: 36,
                escapedPocketDimensions: 17,
                usedAdrenaline: 146,
                lastKillers: [
                    {
                        displayName: "max.bambus",
                        avatarMedium: "https://avatars.fastly.steamstatic.com/96b9b714ea5f18400b2afdfcbf4f75bb83c99109_full.jpg"
                    },
                    {
                        displayName: "Fear",
                        avatarMedium: "https://avatars.steamstatic.com/adffdb027bcea56c8ec6e77266865293eccb481c_medium.jpg"
                    },
                    {
                        displayName: "Waldbin",
                        avatarMedium: "https://avatars.fastly.steamstatic.com/7c9f2c3c58df7e6c05a16ae03aa3344666c5f077_full.jpg"
                    },
                ]
            }
        });
    } else {
        res.status(401).json({ "error": "Unauthorized, please log in first" });
    }
});

app.get('/auth/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            return res.status(500).json({ "error": "Failed to log out" });
        }
        res.json({ "success": true, "message": "Logged out successfully" });
    });
});

app.get('/auth/status', (req, res) => {
    if (req.isAuthenticated()) {
        res.status(200).json({
            id: (req as any).user.id,
            displayName: (req as any).user.displayName,
            avatarIcon: (req as any).user.photos[0].value,
            avatarMedium: (req as any).user.photos[1].value,
            avatarFull: (req as any).user.photos[2].value,
        });
    } else {
        res.sendStatus(403);
    }
});


process.on('SIGINT', () => {
    console.log('Shutting down...');
    process.exit();
});

process.on('SIGTERM', () => {
    console.log('Shutting down...');
    process.exit();
});


server.listen(3000, () => {
    console.log('Backend listening on port 3000.');
});
