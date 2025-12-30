const { EmbedBuilder, PermissionFlagsBits, ApplicationCommandType, ApplicationCommandOptionType } = require("discord.js");

module.exports = {
    name: "restart",
    description: "RESTART BOT (ONLY DEVELOPERS HAS ACCESS)",
    type: ApplicationCommandType.ChatInput,
    toggleOff: false,
    developersOnly: true,
    patreonOnly: false,
    patreonManualWhitelist: [],
    userpermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel],
    botpermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel],
    options: [],
 
    run: async (client, interaction, args) => {
        let embed1 = new EmbedBuilder()
      //embed1.setAuthor("UPDATE")
                 
      embed1.setDescription(`\`\`\`BOT HAS BEEN RESTARTED\`\`\``)
                 
      embed1.setColor("#00FF00");

      await interaction.reply({ embeds: [embed1] }).then(() => {
         process.exit();
      })
    }
}