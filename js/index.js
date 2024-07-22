let backgrounds = [];
let currentBackground = -1;
let timePerImage = 10_000;

// ------------------ MAIN RENDERING 

/**
 * Advances and renders current image to screen
 */
const render = (canvas) => {
    currentBackground++;
    if ((currentBackground + 1) >= backgrounds.length || currentBackground < 0)
        currentBackground = 0;

    console.log("[RENDER] Switiching to background " + currentBackground)

    const img = backgrounds[currentBackground]

    if (!img.loaded) {
        renderBlurhash(canvas, currentBackground);

        const currentBackgroundCopy = currentBackground;

        waitUntil(() => {
            fadeInImage(canvas, backgrounds[currentBackgroundCopy].image);
            console.log("[RENDER] Switiching background " + currentBackground + " because original loaded")
        }, () => {
            if (currentBackground != currentBackgroundCopy) return "cancel";
            return backgrounds[currentBackgroundCopy].loaded;
        })

    } else
        fadeInImage(canvas, img.image);

}

/**
 * Starts the render cycle
 */
const startAnimation = () => {
    console.log("[ANIMAT] Starting background animation")

    const canvas = document.querySelector('canvas');
    canvas.style.width = screen.availWidth;
    canvas.style.height = screen.availHeight;

    canvas.width = screen.availWidth * 2;
    canvas.height = screen.availHeight * 2;

    setInterval(render, timePerImage, canvas);
    render(canvas);
}

// ------------------ LOADING IMAGES / JSON

/**
 * Executes a async GET Request without any extra headers
 * @param {String} url Request target 
 * @returns {Promise}
 */
const GETRequest = (url) => new Promise((res, rej) => {
    const req = new XMLHttpRequest();

    req.onerror = rej;
    req.onload = () => {
        console.log(`[REQUES] GET ${req.status} ${req.statusText} | ${url}`)
        res({
            response: req.responseText,
            status: req.status
        });
    }
    req.open("GET", url);
    req.send();
})

/**
 * Preloads images from background buffer
 */
const preloadImages = () => {
    console.log("[PRELOA] Preloading background images")
    const preloadImageById = (id) => {
        backgrounds[id].loaded = false;

        const image = new Image();

        image.src = backgrounds[id].full;

        image.onload = () => {
            backgrounds[id].loaded = true;
            backgrounds[id].image = image;
        }
    }

    for (let id = 0; id < backgrounds.length; id++)
        preloadImageById(id);
}



// ------------------ MISC


/**
 * Starts an async waiter that waits until the background array is filled
 * @param {Function} callback 
 * @param {Function} requirement If this returns true, callback will be called 
 * @param {Number} timeout (Optional) 
 */
const waitUntil = (callback, requirement, timeout = 50) => {

    const result = requirement();

    if (typeof result === "string") return;

    if (result == true) {
        setTimeout(callback, 1);
        return;
    }

    setTimeout(waitUntil, timeout, callback, requirement, timeout);
}


// ------------------ MISC IMAGE RENDERING

/**
 * Converts ImageData to Image
 * @param {ImageData} imagedata 
 * @returns {Promise} Resolves Image object 
 */
const convertImgdataToImage = async (imagedata) => {
    return new Promise((res, _) => {
        const canvas = document.createElement('canvas');

        canvas.width = imagedata.width;
        canvas.height = imagedata.height;

        const ctx = canvas.getContext('2d');
        ctx.putImageData(imagedata, 0, 0);

        const image = new Image();
        image.onload = () => res(image);

        image.src = canvas.toDataURL();
    })
}


/**
 * Asyncly renders a fadeIn-Animation onto a canvas 
 * @param {HTMLCanvasElement} canvas Canvas where the fadeIn-animation is rendered
 * @param {Image} img The picture that slowly fades in 
 * @param {Number} time How many frames the fade in lasts 
 * @returns {Promise} Resolves when animation is finished
 */
const fadeInImage = (canvas, img, time = 25) => {
    console.log("[FADEIN] Starting FadeIn-Animation for " + time + " frames")
    return new Promise((res, _) => {
        const ctx = canvas.getContext("2d");

        var fadeState = 0;

        const fade = () => {
            if (fadeState >= time) {
                res();
                return;
            }
            requestAnimationFrame(fade);

            ctx.globalAlpha = Math.min((fadeState / time), 1);

            ctx.drawImage(img, img.width / 6, img.height / 6, img.width / 6 * 4.5, img.height / 6 * 4.5, 0, 0, canvas.width, canvas.height);
            fadeState++;
        }

        requestAnimationFrame(fade);

    })
}


/**
 * Decodes and fades in a image with blurhash 
 * @param {HTMLCanvasElement} canvas Canvas to render on
 * @param {Number} index Index of Image Element in backgrounds array 
 */
const renderBlurhash = async (canvas, index) => {
    console.log("[BLURHA] Rendering blurhash for background image " + index);
    const image = backgrounds[index];

    if (!image) return;

    if (!backgrounds[index].blurhashCache || !backgrounds[index].blurhashCache.src || !backgrounds[index].blurhashCache.src.length < 10) {
        console.log("[BLURHA] Generating blurhash background image " + index);
        const start = Date.now();
        const pixels = decodeBlurhash(image.blur, 256, 256);
        const imageData = new ImageData(pixels, 256, 256);
        convertImgdataToImage(imageData)
            .then((res) => {
                console.log("[BLURHA] Took " + (Date.now() - start) + "ms to generate blurhash background image");

                backgrounds[index].blurhashCache = res;
                fadeInImage(canvas, res)
            });
    } else {
        fadeInImage(canvas, backgrounds[index].blurhashCache)
    }

}

// ------------------ INIT

document.addEventListener("DOMContentLoaded", () => waitUntil(startAnimation, () => backgrounds.length > 0));

GETRequest("/assets/backgrounds/animation.json")
    .then((res) => {
        if (res.status >= 200 && res.status <= 204)
            return JSON.parse(res.response);
    })
    .then(
        (res) => {
            backgrounds = res.images;
            timePerImage = res.timePerImage;
        })
    .then((res) => {
        preloadImages(res);
        const canvas = document.querySelector("canvas");
        if (canvas) renderBlurhash(canvas, 0);
    })
    .catch(console.error);