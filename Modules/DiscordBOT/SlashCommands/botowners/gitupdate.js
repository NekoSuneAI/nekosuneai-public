const { EmbedBuilder, PermissionFlagsBits, ApplicationCommandType, ApplicationCommandOptionType } = require("discord.js");

module.exports = {
    name: "gitupdate",
    description: "UPDATE BOT (ONLY DEVELOPERS HAS ACCESS)",
    type: ApplicationCommandType.ChatInput,
    cooldowns: 3000,
    toggleOff: false,
    developersOnly: true,
    patreonOnly: false,
    patreonManualWhitelist: [],
    userpermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel],
    botpermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel],
 
    run: async (client, interaction, args) => {
 
        const { exec } = require('child_process');
      exec('cd /root/botstuff/NekoBOTV14/', async (err, stdout, stderr) => {
        if (err) {
            if (typeof err !== "string")
              err = require("util").inspect(err);

             let embed = new EmbedBuilder()
            .setAuthor({ name: 'UPDATE', iconURL: 'https://cdn.discordapp.com/avatars/783717422355578890/22f6678f49e84ee0afafa1430c844f59.png', url: 'https://nekosunevr.co.uk' })
            .setDescription(`\`\`\`${err}\`\`\``)
            .setColor("#FF0000");

            await interaction.reply({ embeds: [embed] });
            console.error(err)
        } else {
            exec('git pull', async (err1, stdout1, stderr1) => {
              if (err1) {
                if (typeof err !== "string")
                  err1 = require("util").inspect(err1);

                  let embed = new EmbedBuilder()
                  .setAuthor({ name: 'UPDATE', iconURL: 'https://cdn.discordapp.com/avatars/783717422355578890/22f6678f49e84ee0afafa1430c844f59.png', url: 'https://nekosunevr.co.uk' })
                  .setDescription(`\`\`\`${err1}\`\`\``)
                  .setColor("#FF0000");

                  await interaction.reply({ embeds: [embed] });
                  
                  process.exit();
                console.error(err)
              } else {

                if (typeof stdout1 !== "string")
                  stdout1 = require("util").inspect(stdout1);
                
                let embed1 = new EmbedBuilder()
                embed1.setAuthor({ name: 'UPDATE', iconURL: 'https://cdn.discordapp.com/avatars/783717422355578890/22f6678f49e84ee0afafa1430c844f59.png', url: 'https://nekosunevr.co.uk' })
                 
                embed1.setDescription(`\`\`\`${stdout1}\`\`\``)
                embed1.addFields([{ name: "Reminder", value: `\`\`\`MAKE SURE DO "(PREFIX)reload commandname" FOR UPDATE COMMANDS\`\`\`` }])
                 
                embed1.setColor("#00FF00");

                await interaction.reply({ embeds: [embed1] });
              }
           });
        }
      });

       
    }
}