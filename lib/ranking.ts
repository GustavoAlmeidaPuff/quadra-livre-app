import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getUserTotalHours } from '@/lib/stats';

export interface HoursRankingEntry {
  id: string;
  name: string;
  initials: string;
  pictureUrl?: string | null;
  hours: number;
  createdAt: Date;
}

function getInitials(firstName?: string, lastName?: string): string {
  return `${(firstName || 'U')[0]}${(lastName || '')[0] || ''}`.toUpperCase();
}

/** Ranking geral por horas jogadas, com o mesmo desempate usado na aba Social. */
export async function getHoursRanking(): Promise<HoursRankingEntry[]> {
  const snap = await getDocs(collection(db, 'users'));
  const users = snap.docs.filter((userDoc) => !userDoc.data()?.isAnonymous);
  const hoursList = await Promise.all(users.map((userDoc) => getUserTotalHours(userDoc.id)));

  return users
    .map((userDoc, index) => {
      const user = userDoc.data();
      return {
        id: userDoc.id,
        name: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'Jogador',
        initials: getInitials(user?.firstName, user?.lastName),
        pictureUrl: user?.pictureUrl,
        hours: hoursList[index],
        createdAt: user?.createdAt?.toDate?.() ?? new Date(0),
      };
    })
    .sort((a, b) =>
      b.hours !== a.hours
        ? b.hours - a.hours
        : a.createdAt.getTime() - b.createdAt.getTime()
    );
}
