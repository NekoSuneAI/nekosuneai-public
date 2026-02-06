const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
  ApplicationCommandType,
  ApplicationCommandOptionType,
  ComponentType,
  AttachmentBuilder
} = require('discord.js')

const path = require('path')
const fs = require('fs')

const { resetMemory } = require('../../../VRChatAI/AI/Addons/DB/memoryStore')
const {
  readAndPrintSentencesAdminCmds
} = require('../../../VRChatAI/AI/VOICEModules/Speak')

module.exports = {
  name: 'vrcmoderation',
  description: 'VRChat Moderation Command',
  toggleOff: false,
  developersOnly: true,
  type: ApplicationCommandType.ChatInput,
  userpermissions: [
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ViewChannel
  ],
  botpermissions: [
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ViewChannel
  ],
  options: [
    {
      name: 'action',
      description: 'Moderation Type!',
      type: ApplicationCommandOptionType.String,
      required: true,
      choices: [
        { name: 'reset', value: 'reset' }
      ]
    }
  ],
  run: async (client, interaction, args) => {
    const action = interaction.options.getString('action')
    const rootDir = path.resolve(__dirname, '../../../../')

    if (!action) {
      return interaction.reply({
        content: 'You must provide a moderation tool.',
        ephemeral: true
      })
    }
    
    if (action === 'reset') {
      await resetMemory()
      await readAndPrintSentencesAdminCmds([
        'Admin has forced to Reset my Memory.'
      ])
      return interaction.reply({
        content: 'Memory has been reset.',
        ephemeral: true
      })
    }
  }
}
