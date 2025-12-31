const {
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    PermissionFlagsBits,
    ApplicationCommandType,
    ApplicationCommandOptionType,
    ComponentType
} = require("discord.js");

const { readAndPrintSentencesAdminCmds } = require('../../../AUTOAI/VOICEModules/Speak')

module.exports = {
    name: "broadcast",
    description: "NekoSuenAI VRChat Broadcast Command",
    toggleOff: false,
    developersOnly: true,
    type: ApplicationCommandType.ChatInput,
    userpermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel],
    botpermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel],
    options: [{
        name: 'message',
        description: 'Broadcast ME!',
        type: ApplicationCommandOptionType.String,
        required: true
    }],
    run: async (client, interaction, args) => {

        const message = interaction.options.getString('message');
        if (!message) {
            return interaction.reply({ content: 'You must provide a message.', ephemeral: true });
        }

        // Function to split text into chunks (maxLen = 144)
        function splitIntoChunks(str, maxLen) {
            const words = str.split(' ');
            const chunks = [];
            let current = '';

            for (const word of words) {
                if ((current + word).length + 1 > maxLen) {
                    chunks.push(current.trim());
                    current = word;
                } else {
                    current += (current ? ' ' : '') + word;
                }
            }
            if (current) chunks.push(current.trim());
            return chunks;
        }

        const rawChunks = splitIntoChunks(message, 134);

        // Add [BROADCAST] to each line
        const sentences = rawChunks.map(c => `[BROADCAST]\n${c}`);

        readAndPrintSentencesAdminCmds(sentences)
        const embed = new EmbedBuilder()
            .addFields({
                name: 'Exicuted by:',
                value: `Broadcast been Exiucuted`,
                inline: true
            })
            .setTimestamp()

        await interaction.reply({
            embeds: [embed]
        });
    },
};
