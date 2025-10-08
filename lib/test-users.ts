import { deriveKeysFromSeed } from './crypto';

export interface TestUser {
  seed: string;
  ss58Address: string;
  displayName: string;
  pk: string;
  avatarUrl?: string;
  about?: string;
}

// Raw test user data without derived keys
const TEST_USER_DATA = [
  {
    seed: "property reject cute tower awkward boil burst advice door phrase fuel lift",
    ss58Address: "5DJLXUGEbVzkVzAXPWd6rQB4MVz4kd91DwmfRdbtwbDNn6tp",
    displayName: "Alice",
    about: "Crypto enthusiast and early adopter",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=alice"
  },
  {
    seed: "ordinary powder shop december slim clown ripple mixed benefit curious hungry ball",
    displayName: "Bob",
    ss58Address: "5EqSQFpxJKMzk6vQjNwTYKnuKhSsfoJQgCJgmyVAfruq2KRg ",
    about: "Developer and blockchain researcher",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=bob"
  },
  {
    seed: "dynamic junior sight client omit cart write domain material surround uncle assist",
    displayName: "Charlie",
    ss58Address: "5Giwdi1zYphK3SpY25stXdr8cdXCDUHfC6Nc56vusvkMsb9S",
    about: "Privacy advocate and security expert",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=charlie"
  },
  {
    seed: "anger cloud box pattern hundred wrestle fortune soap permit eight dynamic elder",
    displayName: "Diana",
    ss58Address: "5CcNKHsRXF88KY1Axpf45FtoFJDbwm6AM9QVc2ivcDaYW1w4",
    about: "AI researcher and tech innovator",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=diana"
  },
  {
    seed: "throw brother wire monkey pioneer visit photo taxi own toast gallery major",
    displayName: "Eve",
    ss58Address: "5CDbLwKYpHeMpRFMoRLvCK7wA8ezoqPBbYF54Dzw7M22xKy7",
    about: "Digital artist and NFT creator",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=eve"
  },
  {
    seed: "erupt ensure village chunk vote cross plastic deer bulk cube venue pipe",
    displayName: "Frank",
    ss58Address: "5Esp6drUHSHJv5MMc7UjcSfyGRNcmEQSDbnhUAX6zuozr3N2",
    about: "DeFi protocol developer",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=frank"
  },
  {
    seed: "ranch series twelve ice come message shrug pupil soda capital piano film",
    displayName: "Grace",
    ss58Address: "5DnsmkR4JqdCMSchayN3cs2ykpjHxoqTBMoLB2NbztZHR5ma",
    about: "Blockchain consultant and educator",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=grace"
  },
  {
    seed: "comic erase naive cactus refuse economy guilt pulp cup frost blur mercy",
    displayName: "Henry",
    ss58Address: "5Gee3TeFazfXJMs44dS5XENRixSNWmJcDUY6L4Vo5kvvBSo1",
    about: "Smart contract auditor",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=henry"
  },
  {
    seed: "human stock federal ready rough enough bargain acquire awake bronze lumber minute",
    displayName: "Ivy",
    ss58Address: "5HDhqxBDDkGgPSEnaKnny4v9NJnxCuFXKiY8iqMWD83j95dF",
    about: "Web3 community manager",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=ivy"
  },
  {
    seed: "private crime cushion direct trumpet olympic naive strike sell affair own plug",
    displayName: "Jack",
    ss58Address: "5FjqrPiveeQuPSV1GeAnwdDy9DrzS5oJZ7wqs1zGHKo1SkAz",
    about: "Cryptocurrency trader and analyst",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=jack"
  }
];

// Cache for derived test users
let _testUsers: TestUser[] | null = null;

// Initialize test users with derived keys
export function initializeTestUsers(): TestUser[] {
  if (_testUsers) {
    return _testUsers;
  }

  const users = TEST_USER_DATA.map((user) => {
    const { ss58Address, pk } = deriveKeysFromSeed(user.seed, user.ss58Address);
    return {
      ...user,
      ss58Address,
      pk: Buffer.from(pk).toString('hex')
    };
  });

  _testUsers = users;
  return users;
}

// Get test users (will initialize if needed)
export function getTestUsers(): TestUser[] {
  return initializeTestUsers();
}

export function getTestUserByAddress(address: string): TestUser | undefined {
  const users = getTestUsers();
  return users.find(user => user.ss58Address === address);
}

export function getTestUserBySeed(seed: string): TestUser | undefined {
  const users = getTestUsers();
  return users.find(user => user.seed === seed);
}
