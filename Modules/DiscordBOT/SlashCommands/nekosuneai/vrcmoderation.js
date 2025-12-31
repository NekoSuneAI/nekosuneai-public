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

const { captureVRChat } = require('../../../Addons/screenshot')
const { resetMemory } = require('../../../Addons/memoryStore')
const {
  readAndPrintSentencesAdminCmds
} = require('../../../AUTOAI/VOICEModules/Speak')

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
        { name: 'screenshot', value: 'screenshot' },
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
    if (action === 'screenshot') {
      // build unique file name: vrchat_2025-09-22_10-35-12.png
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-') // safe for Windows filenames
        .slice(0, 19) // yyyy-mm-ddTHH-MM-SS
      const random = Math.floor(Math.random() * 10000)
      const fileName = `vrchat_${timestamp}_${random}.png`
      // build full path: <rootDir>/moderationlogs/screenshot/vrchat.png
      const screenshotPath = path.join(rootDir, 'moderationlogs', 'screenshot')
      // make sure folder exists
      fs.mkdirSync(path.dirname(screenshotPath), { recursive: true })

      // build the full file path
      const fullPath = path.join(screenshotPath, fileName)

      captureVRChat(fullPath)
        .then(async filePath => {
          // create attachment from the saved screenshot
          const attachment = new AttachmentBuilder(filePath, {
            name: 'vrchat.png'
          })

          // build an embed that shows the image
          const embed = new EmbedBuilder()
            .setTitle('📸 VRChat Screenshot')
            .setDescription('Here is the latest capture!')
            .setImage('attachment://vrchat.png')
            .setColor(0x5865f2)
            .setTimestamp()

          await interaction.reply({
            embeds: [embed],
            files: [attachment]
          })
        })
        .catch(console.error)
    } else if (action === 'reset') {
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
