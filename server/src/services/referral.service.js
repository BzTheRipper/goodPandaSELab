import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { ORDER_STATUS } from '../constants.js';
import { Order, Referral, User } from '../models/index.js';
import { notify } from './notification.service.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Human-friendly, unambiguous code (no O/0/I/1). */
function newCode() {
  let out = 'GP';
  for (let i = 0; i < 5; i++) out += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return out;
}

/** Lazily assigns a referral code, retrying on the rare unique-index collision. */
export async function ensureReferralCode(user) {
  if (user.referralCode) return user.referralCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    if (await User.exists({ referralCode: code })) continue;
    const updated = await User.findOneAndUpdate(
      { _id: user._id, referralCode: { $exists: false } },
      { $set: { referralCode: code } },
      { new: true }
    ).select('referralCode');
    if (updated?.referralCode) {
      user.referralCode = updated.referralCode;
      return updated.referralCode;
    }
    const fresh = await User.findById(user._id).select('referralCode');
    if (fresh?.referralCode) return fresh.referralCode;
  }
  return null;
}

/**
 * Links a new account to the inviter's code and grants the signup credit.
 * Returns the Referral row (PENDING) or null when the code is unknown/self-referral.
 */
export async function applyInvite(invitee, code) {
  if (!code) return null;
  const inviter = await User.findOne({
    referralCode: String(code).trim().toUpperCase(),
    role: 'customer',
    isActive: true,
  }).select('_id referralCode');
  if (!inviter || String(inviter._id) === String(invitee._id)) return null;

  await User.updateOne({ _id: invitee._id }, { $set: { referredBy: inviter._id } });
  invitee.referredBy = inviter._id;
  if (env.loyalty.referralSignupCredit > 0) {
    await User.updateOne({ _id: invitee._id }, { $inc: { creditBalance: env.loyalty.referralSignupCredit } });
  }
  return Referral.create({
    inviter: inviter._id,
    invitee: invitee._id,
    code: inviter.referralCode,
    rewardAmount: env.loyalty.referralReward,
  });
}

/** Pays the inviter once, when the invitee's first order is collected. */
export async function rewardReferralOnFirstOrder(order) {
  const collected = await Order.countDocuments({ customer: order.customer, status: ORDER_STATUS.COLLECTED });
  if (collected !== 1) return null;
  const referral = await Referral.findOneAndUpdate(
    { invitee: order.customer, status: 'PENDING' },
    { $set: { status: 'REWARDED', rewardedAt: new Date() } },
    { new: true }
  );
  if (!referral) return null;
  await User.updateOne({ _id: referral.inviter }, { $inc: { creditBalance: referral.rewardAmount } });
  await notify(referral.inviter, {
    type: 'REFERRAL_REWARD',
    title: `You earned ৳${referral.rewardAmount} credit`,
    body: 'A friend you invited collected their first order. The credit applies at checkout.',
  }).catch(() => {});
  return referral;
}

/** Adds one loyalty stamp per collected order and pays out every N stamps. */
export async function stampLoyalty(order) {
  const target = env.loyalty.stampsPerReward;
  if (!(target > 0)) return null;
  const user = await User.findById(order.customer).select('loyaltyStamps');
  if (!user) return null;
  const next = (user.loyaltyStamps || 0) + 1;
  if (next < target) {
    await User.updateOne({ _id: user._id }, { $set: { loyaltyStamps: next } });
    return { stamps: next, rewarded: false };
  }
  await User.updateOne(
    { _id: user._id },
    { $set: { loyaltyStamps: 0 }, $inc: { loyaltyRewards: 1, creditBalance: env.loyalty.reward } }
  );
  await notify(user._id, {
    type: 'LOYALTY_REWARD',
    title: `Loyalty reward: ৳${env.loyalty.reward} credit`,
    body: `Every ${target} collected orders earns store credit. It applies automatically at checkout.`,
  }).catch(() => {});
  return { stamps: 0, rewarded: true };
}

export const refundCredit = (userId, amount) =>
  amount > 0 ? User.updateOne({ _id: userId }, { $inc: { creditBalance: amount } }) : Promise.resolve(null);

/** Profile payload: own code, balance, stamps and invite history. */
export async function referralsFor(user) {
  const code = await ensureReferralCode(user);
  const fresh = await User.findById(user._id).select('creditBalance loyaltyStamps loyaltyRewards');
  const invites = await Referral.find({ inviter: user._id }).sort({ createdAt: -1 }).limit(50).populate('invitee', 'name createdAt');
  return {
    code,
    creditBalance: fresh?.creditBalance || 0,
    loyalty: {
      stamps: fresh?.loyaltyStamps || 0,
      target: env.loyalty.stampsPerReward,
      rewards: fresh?.loyaltyRewards || 0,
      rewardAmount: env.loyalty.reward,
    },
    signupCredit: env.loyalty.referralSignupCredit,
    rewardAmount: env.loyalty.referralReward,
    invites: invites.map((r) => ({
      id: r._id,
      name: r.invitee?.name || 'Invited friend',
      status: r.status,
      joinedAt: r.createdAt,
      rewardedAt: r.rewardedAt,
    })),
  };
}
