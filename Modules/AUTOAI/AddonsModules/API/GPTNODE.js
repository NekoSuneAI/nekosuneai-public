const { config } = require('../../../config');

async function RESPGPT(prompt, model) {
    const OpenAI = require('openai');
    const openaiself = new OpenAI({
        apiKey: `${config.addons.AI.OPENAI.apiKey}`,
        baseURL: `${config.addons.AI.OPENAI.baseURL}`
    });

    try {
    
        const response = await openaiself.chat.completions.create({
            model: `${model}`,
            messages: 
            [{
                "role": "system", "content": `${config.addons.AI.OPENAI.systemmsg}`
            },
            {
                "role": "user", "content": prompt
            }],
            temperature: 0.5,
            max_tokens: 1000,
        });

        const awser = response.choices[0].message;

         //console.log('[RESPGPT dev]', awser)
        
         // Split the text into words
        const sentences = awser.content.split(/\s+/);

         // Initialize an empty array to store the result
        const filteredSentences = [];
         // Initialize a variable to track the current position in the text
        let currentPosition = 0;

         // Iterate over the words
        for (const word of sentences) {
           // Check if adding the current word exceeds the limit (144 characters)
        if (filteredSentences.length === 0 || filteredSentences[filteredSentences.length - 1].length + word.length + 1 > 129) {
             // If it does, start a new string in the array
            filteredSentences.push(word);
            currentPosition = word.length;
        } else {
             // If it doesn't, add the word to the current string in the array
            filteredSentences[filteredSentences.length - 1] += " " + word;
            currentPosition += word.length + 1;
            }
        }

        if (awser.content == "Request failed with status code 429") { 
            return {"status": 429, "message": "Too many Requests from this IP, please try again after 5 minutes"};
        } else {
            var responsejson = { 
                status: 200,
                role: 'assistant',
                content: awser.content,
                contentarray: filteredSentences
            }
            return responsejson;
        }         
    } catch (error) {
        var responsejson = {
            status: 504,
            role: 'assistant',
            content: 'Request timed out'
        };
           //console.log('error', error);
        return responsejson;
    }
}

module.exports = {
    RESPGPT
};