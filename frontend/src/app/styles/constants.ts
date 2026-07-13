export const styles = {
  container: {
    main: "max-w-6xl mx-auto px-4 py-8",
    header: "bg-white shadow-sm rounded-lg p-6 mb-8",
    gameList: "space-y-4",
  },
  header: {
    wrapper: "flex items-center justify-between",
    title: "text-2xl font-bold text-gray-900",
    select:
      "block w-48 px-3 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 font-medium",
  },
  game: {
    card: "bg-white rounded-xl overflow-hidden border border-gray-200",
    header: "px-5 py-3 border-b border-gray-200",
    headerContent: "flex flex-col items-center gap-1",
    title: "text-lg font-semibold text-gray-900",
    date: "text-sm text-gray-600 bg-gray-50 px-3 py-1 rounded-full",
    gameInfo: "flex flex-col items-center mb-1",
    content: "p-4",
    grid: "grid grid-cols-1 md:grid-cols-2 gap-4",
    score: {
      container: "flex items-center justify-center gap-4 text-lg font-bold",
      team: "flex items-center gap-2",
      value: "text-2xl text-gray-900",
      vs: "text-gray-400",
      result: {
        win: "text-green-600",
        lose: "text-red-600",
        draw: "text-gray-600",
      },
    },
  },
  team: {
    container: "bg-white rounded-lg p-3 shadow-sm",
    title: "text-base font-semibold text-gray-900 pb-2 border-b border-gray-200 mb-3",
    playerList: "space-y-1",
    playerItem: "group hover:bg-gray-50 p-1.5 rounded-lg transition-colors",
    playerName: "text-base font-semibold text-gray-900 mb-0.5 cursor-pointer hover:text-blue-600 transition-colors",
    noPlayer: "text-sm text-gray-500",
  },
  logs: {
    container: "flex flex-wrap items-center gap-1",
    positive: {
      container: "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100",
      badge: "ml-1 text-xs",
    },
    negative: {
      container: "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-100",
      badge: "ml-1 text-xs",
    },
  },
  loading: "flex justify-center items-center min-h-[50vh]",
  loadingSpinner: "animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600",
  error: {
    container: "max-w-4xl mx-auto mt-8",
    content: "bg-red-50 border border-red-200 rounded-lg p-6",
    text: "text-red-800",
  },
  emptyState: {
    container: "bg-white shadow-sm rounded-lg p-8",
    text: "text-center",
    message: "text-gray-500 text-lg",
  },
  modal: {
    overlay: "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50",
    container: "bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col",
    header: "px-6 py-4 border-b border-gray-200 flex items-center justify-between",
    title: "text-xl font-semibold text-gray-900",
    closeButton: "text-gray-400 hover:text-gray-500 focus:outline-none",
    content: "p-6 overflow-y-auto",
    statsList: "space-y-3",
    statItem: "flex items-center justify-between py-2 border-b border-gray-100 last:border-0",
    statName: "text-gray-600",
    statValue: "font-medium text-gray-900",
  },
};
