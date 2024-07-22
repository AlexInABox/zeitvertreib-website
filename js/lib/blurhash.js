/**
 * Edited by radston12
 * 
 * Converted from a nodejs module scheme to browser script in following steps:
 *  - Deobfuscated
 *  - Removed module.exports
 *  - Removed exports
 *  - Created _loadBlurhash function
 *  - Renamed encode => encodeBlurhash  and  decode => decodeBlurhash
 *  - Objects isBlurhashValid, encodeBlurhash, decodeBlurhash are now in the global script enviroment
 */

const _loadBlurhash = () => {
    var q = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z", "#", "$", "%", "*", "+", ",", "-", ".", ":", ";", "=", "?", "@", "[", "]", "^", "_", "{", "|", "}", "~"], x = t => {
        let e = 0;
        for (let r = 0; r < t.length; r++) {
            let n = t[r], l = q.indexOf(n);
            e = e * 83 + l;
        }
        return e;
    }, p = (t, e) => {
        var r = "";
        for (let n = 1; n <= e; n++) {
            let l = Math.floor(t) / Math.pow(83, e - n) % 83;
            r += q[Math.floor(l)];
        }
        return r;
    };
    var f = t => {
        let e = t / 255;
        return e <= 0.04045 ? e / 12.92 : Math.pow((e + 0.055) / 1.055, 2.4);
    }, h = t => {
        let e = Math.max(0, Math.min(1, t));
        return e <= 0.0031308 ? Math.trunc(e * 12.92 * 255 + 0.5) : Math.trunc((1.055 * Math.pow(e, 0.4166666666666667) - 0.055) * 255 + 0.5);
    }, F = t => t < 0 ? -1 : 1, M = (t, e) => F(t) * Math.pow(Math.abs(t), e);
    var d = class extends Error {
        constructor(e) {
            super(e), this.name = "ValidationError", this.message = e;
        }
    };
    var C = t => {
        if (!t || t.length < 6) throw new d("The blurhash string must be at least 6 characters");
        let e = x(t[0]), r = Math.floor(e / 9) + 1, n = e % 9 + 1;
        if (t.length !== 4 + 2 * n * r) throw new d(`blurhash length mismatch: length is ${t.length} but it should be ${4 + 2 * n * r}`);
    }, isBlurhashValid = t => {
        try {
            C(t);
        } catch (e) {
            return { result: false, errorReason: e.message };
        }
        return { result: true };
    }, z = t => {
        let e = t >> 16, r = t >> 8 & 255, n = t & 255;
        return [f(e), f(r), f(n)];
    }, L = (t, e) => {
        let r = Math.floor(t / 361), n = Math.floor(t / 19) % 19, l = t % 19;
        return [M((r - 9) / 9, 2) * e, M((n - 9) / 9, 2) * e, M((l - 9) / 9, 2) * e];
    }, U = (t, e, r, n) => {
        C(t), n = n | 1;
        let l = x(t[0]), m = Math.floor(l / 9) + 1, b = l % 9 + 1, i = (x(t[1]) + 1) / 166, u = new Array(b * m);
        for (let o = 0; o < u.length; o++) if (o === 0) {
            let a = x(t.substring(2, 6));
            u[o] = z(a);
        } else {
            let a = x(t.substring(4 + o * 2, 6 + o * 2));
            u[o] = L(a, i * n);
        }
        let c = e * 4, s = new Uint8ClampedArray(c * r);
        for (let o = 0; o < r; o++) for (let a = 0; a < e; a++) {
            let y = 0, B = 0, R = 0;
            for (let w = 0; w < m; w++) for (let P = 0; P < b; P++) {
                let G = Math.cos(Math.PI * a * P / e) * Math.cos(Math.PI * o * w / r), T = u[P + w * b];
                y += T[0] * G, B += T[1] * G, R += T[2] * G;
            }
            let V = h(y), I = h(B), E = h(R);
            s[4 * a + 0 + o * c] = V, s[4 * a + 1 + o * c] = I, s[4 * a + 2 + o * c] = E, s[4 * a + 3 + o * c] = 255;
        }
        return s;
    }, decodeBlurhash = U;
    var A = 4, D = (t, e, r, n) => {
        let l = 0, m = 0, b = 0, g = e * A;
        for (let u = 0; u < e; u++) {
            let c = A * u;
            for (let s = 0; s < r; s++) {
                let o = c + s * g, a = n(u, s);
                l += a * f(t[o]), m += a * f(t[o + 1]), b += a * f(t[o + 2]);
            }
        }
        let i = 1 / (e * r);
        return [l * i, m * i, b * i];
    }, $ = t => {
        let e = h(t[0]), r = h(t[1]), n = h(t[2]);
        return (e << 16) + (r << 8) + n;
    }, H = (t, e) => {
        let r = Math.floor(Math.max(0, Math.min(18, Math.floor(M(t[0] / e, 0.5) * 9 + 9.5)))), n = Math.floor(Math.max(0, Math.min(18, Math.floor(M(t[1] / e, 0.5) * 9 + 9.5)))), l = Math.floor(Math.max(0, Math.min(18, Math.floor(M(t[2] / e, 0.5) * 9 + 9.5))));
        return r * 19 * 19 + n * 19 + l;
    }, O = (t, e, r, n, l) => {
        if (n < 1 || n > 9 || l < 1 || l > 9) throw new d("BlurHash must have between 1 and 9 components");
        if (e * r * 4 !== t.length) throw new d("Width and height must match the pixels array");
        let m = [];
        for (let s = 0; s < l; s++) for (let o = 0; o < n; o++) {
            let a = o == 0 && s == 0 ? 1 : 2, y = D(t, e, r, (B, R) => a * Math.cos(Math.PI * o * B / e) * Math.cos(Math.PI * s * R / r));
            m.push(y);
        }
        let b = m[0], g = m.slice(1), i = "", u = n - 1 + (l - 1) * 9;
        i += p(u, 1);
        let c;
        if (g.length > 0) {
            let s = Math.max(...g.map(a => Math.max(...a))), o = Math.floor(Math.max(0, Math.min(82, Math.floor(s * 166 - 0.5))));
            c = (o + 1) / 166, i += p(o, 1);
        } else c = 1, i += p(0, 1);
        return i += p($(b), 4), g.forEach(s => {
            i += p(H(s, c), 2);
        }), i;
    }, encodeBlurhash = O;    
    
    return { e: encodeBlurhash, d: decodeBlurhash, v: isBlurhashValid };
}

// Dirty trick to make them globaly available
// Would use Object.defineProperties if it would not screw up half the time
const {e, d, v} = _loadBlurhash();

const encodeBlurhash = e;
const decodeBlurhash = d;
const isBlurhashValid = v;
// Dirty trick end