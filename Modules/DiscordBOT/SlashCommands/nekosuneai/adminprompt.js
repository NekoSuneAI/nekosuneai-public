const {
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    PermissionFlagsBits,
    ApplicationCommandType,
    ApplicationCommandOptionType,
    ComponentType,
    AttachmentBuilder
} = require("discord.js");

const { RunCommands } = require('../../../VRChatAI/AI/Commands/Main');
const { readAndPrintSentences, startRenderProgress, stopRenderProgress } = require('../../../VRChatAI/AI/VOICEModules/Speak');
const { setMicDisabled, setAdminPromptActive } = require('../../../Addons/VoiceState');
const { startRecordingAndRunDeepSpeech, stopRecording } = require('../../../VRChatAI/AI/VOICEModules/Main');

module.exports = {
    name: "adminprompt",
    description: "VRChat Admin Prompt Command",
    toggleOff: false,
    developersOnly: true,
    type: ApplicationCommandType.ChatInput,
    userpermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel],
    botpermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel],
    options: [{
        name: 'prompt',
        description: 'Ask Me Anything!',
        type: ApplicationCommandOptionType.String,
        required: true,
    }],
    run: async (client, interaction, args) => {
        const prompt = interaction.options.getString('prompt');
        const resulttt = [
            {
                text: prompt
            }
        ];

        setAdminPromptActive(true);
        setMicDisabled(true);
        stopRecording();
        startRenderProgress(2*60);

        await interaction.reply({ content: `Executing command!`, ephemeral: true });
        try {
            await RunCommands(null, resulttt, null);
        } finally {
            setMicDisabled(false);
            setAdminPromptActive(false);
            stopRenderProgress({ force: true });
            startRecordingAndRunDeepSpeech();
        }
    },
};
