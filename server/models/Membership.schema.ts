import { defineMongooseModel } from '#nuxt/mongoose'

// One document per Discord user that has (or had) the Alpha membership.
// _id is the Discord user id, same as DiscordUser._id.
//
// Discord is the source of truth for "is Alpha right now" (DiscordUser.roles,
// kept current by stcbot). `status` records what *we* did: promoted, paused, or
// removed — so a paused member still shows up even though the role is gone.
const fileSchema = {
    kind: { type: String, enum: ['payment', 'contract'], required: true },
    key: { type: String, required: true },
    fileName: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: String },
}

export const Membership = defineMongooseModel({
    name: 'Membership',
    schema: {
        _id: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: ['active', 'paused', 'removed'],
            default: 'active',
        },
        purchasedAt: { type: Date, default: null },
        expiresAt: { type: Date, default: null },
        notes: { type: String, default: '' },
        files: { type: [fileSchema], default: [] },
        pauses: {
            type: [{
                startedAt: { type: Date, required: true },
                months: { type: Number, required: true },
                resumesAt: { type: Date, required: true },
                resumedAt: { type: Date, default: null },
                reason: { type: String, default: '' },
                by: { type: String },
            }],
            default: [],
        },
        history: {
            type: [{
                action: { type: String, required: true },
                at: { type: Date, default: Date.now },
                by: { type: String },
                detail: { type: String, default: '' },
            }],
            default: [],
        },
    },
    options: {
        collection: 'memberships',
        timestamps: true,
    },
})
