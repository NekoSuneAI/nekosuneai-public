const { EmbedBuilder, PermissionFlagsBits, ApplicationCommandType, ApplicationCommandOptionType } = require("discord.js");
const { stripIndents } = require("common-tags");
const { getMember, formatDate } = require("../../utils/funt-slash.js");

module.exports = {
    name: "whois",
    description: "Returns user information",
    type: ApplicationCommandType.ChatInput,
    toggleOff: false,
    developersOnly: false,
    userpermissions: [PermissionFlagsBits.Administrator],
    botpermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel],
    cooldowns: 2000,
    options: [{
        name: 'user',
        description: 'Select User',
        type: ApplicationCommandOptionType.String,
        required: true
    }],

    run: async (client, interaction, args) => {
        const member = getMember(interaction, interaction.options.getString('user'));

        // Member variables
        const joined = formatDate(member.joinedAt);
        const roles = member.roles.cache
            .filter(r => r.id !== interaction.guild.id)
            .map(r => r).join(", ") || 'none';

        // User variables
        const created = formatDate(member.user.createdAt);

        const embed = new EmbedBuilder()
            //.setFooter(member.displayName, member.user.displayAvatarURL)
            //.setThumbnail(member.user.displayAvatarURL)
            .setColor(member.displayHexColor === '#000000' ? '#ffffff' : member.displayHexColor)

            .addFields({
                name: 'Member information:',
                value: stripIndents`**- Display name:** ${member.displayName}
               **- Joined at:** ${joined}
               **- Roles:** ${roles}`,
                inline: true
            },
                {
                    name: 'User information:',
                    value: stripIndents`**- ID:** ${member.user.id}
               **- Username**: ${member.user.username}
               **- Tag**: ${member.user.tag}
               **- Created at**: ${created}`,
                    inline: true
                }
            )

            .setTimestamp()

        await interaction.reply({
            embeds: [embed]
        });

    }
}
