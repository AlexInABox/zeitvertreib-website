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
        res.json({ "success": true, "stats": { /* Your stats data here */ } });
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
        res.sendStatus(200);
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
