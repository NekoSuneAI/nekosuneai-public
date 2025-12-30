const { EmbedBuilder, PermissionFlagsBits, ApplicationCommandType, ApplicationCommandOptionType } = require("discord.js");

module.exports = {
    name: "eval",
    description: "Evaluate Code",
    type: ApplicationCommandType.ChatInput,
    toggleOff: false,
    developersOnly: true,
    patreonOnly: false,
    patreonManualWhitelist: [],
    userpermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel],
    botpermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel],
    options: [{
        name: 'evalcode',
        description: 'CODE HERE',
        type: ApplicationCommandOptionType.String,
        required: true
    }],
 
    run: async (client, interaction, args) => {
        await interaction.deferReply({ ephemeral: false });
        
        try {
            const code = interaction.options.getString('evalcode'); //args.join(" ");
            if (!code) {
               return await interaction.reply("Please Provide A code to eval!");
            }
            let evaled = eval(code);
   
            if (typeof evaled !== "string")
               evaled = require("util").inspect(evaled);
               
              for(let i = 0; i < evaled.length; i += 2000) {
                  setTimeout(async () => {
                 
                    const toSend = evaled.substring(i, Math.min(evaled.length, i + 2000));
                    let embed22 = new EmbedBuilder()
                      .setAuthor({ name: 'EVAL CODE', iconURL: 'https://cdn.discordapp.com/avatars/783717422355578890/22f6678f49e84ee0afafa1430c844f59.png', url: 'https://nekosunevr.co.uk' })
                      .addFields([
                        { name: "Input", value: `${code}`},
                        { name: 'Output', value: `output Below` },
                      ])
                      .setDescription(`\`\`\`${toSend}\`\`\``)
                      .setColor("#0000FF");
                    await interaction.followUp({ embeds: [embed22] })
                  }, 5000);
              }
   
            //await interaction.reply({ embeds: [embed] });
         } catch (err) {
            await interaction.reply(`\`ERROR\` \`\`\`js\n${err}\n\`\`\``);
         }
    }
}
