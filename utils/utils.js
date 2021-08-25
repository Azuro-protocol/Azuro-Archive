function makeid(length) {
    var result = [];
    var characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result.push(characters.charAt(Math.floor(Math.random() * charactersLength)));
    }
    return result.join("");
}

function getRandomConditionID() {
    return Math.random() * 1000000000;
}

function timeout(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
    makeid, timeout
}
