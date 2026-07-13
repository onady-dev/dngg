import { api } from '@/lib/axios';
import { Game } from '@/types/game';
import { InGamePlayer, Player } from '@/types/player';

export const gameService = {
  getGames: async (): Promise<Game[]> => {
    const response = await api.get('/api/games');
    return response.data;
  },

  getGameById: async (id: number): Promise<Game> => {
    const response = await api.get(`/api/games/${id}`);
    return response.data;
  },

  getGamePlayers: async (gameId: number): Promise<InGamePlayer[]> => {
    const response = await api.get(`/api/games/${gameId}/players`);
    return response.data;
  },

  getPlayersByGroup: async (groupId: number): Promise<Player[]> => {
    const response = await api.get(`/api/groups/${groupId}/players`);
    return response.data;
  }
}; 