async function JokesGrabber(filters) {
    try {
        if (filters) {
            const jokeurl = await fetch('https://v2.jokeapi.dev/joke/Any?blacklistFlags=nsfw,religious,political,racist,sexist,explicit', {
                method: 'GET',
            }).then(res => res.json());
        
            var responsetext = [
                'Okay, heres a Joke for you',
                jokeurl.setup,
                jokeurl.delivery,
                'Hope you like that joke?'
            ];
        } else {
            const jokeurl = await fetch('https://v2.jokeapi.dev/joke/Any', {
                method: 'GET',
            }).then(res => res.json());
        
            var responsetext = [
                'Okay, heres a Joke for you',
                jokeurl.setup,
                jokeurl.delivery,
                'Hope you like that joke?'
            ];
        }
        return { resp: responsetext };
    } catch (error) {
        console.error('Error fetching time data:', error);
        return null;
    }
}

module.exports = {
    JokesGrabber
}