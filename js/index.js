var counter = 0;
const queueAnim = () => {
    counter++;
    console.log("Loaded " + counter + "/4 images");
    if (counter === 4) {
        console.log("All images loaded");
        document.querySelector("main").classList.add("animatedMain");
    }
}