(function () {
  if (window.TikunBank && window.TikunBank.__DATA_LOADED__) return;

  const PRODUCT_CATEGORIES = {
    people: "Люди",
    expertise: "Экспертиза",
    ads: "Реклама",
    other: "Разное",
  };

  const getSupabase = async () => window.getSupabaseClient();

  const formatMoney = (value) =>
    new Intl.NumberFormat("ru-RU", {
      maximumFractionDigits: 0,
    }).format(value || 0);

  const formatDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("ru-RU", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  };

  const getRanking = (teams) => {
    const activeTeams = teams.filter((team) => team.is_active);
    const sorted = [...activeTeams].sort((a, b) => {
      if (b.cumulative_score !== a.cumulative_score) {
        return b.cumulative_score - a.cumulative_score;
      }
      return a.name.localeCompare(b.name, "ru");
    });
    return sorted.map((team, idx) => ({
      team,
      rank: idx + 1,
    }));
  };

  const fetchPublicSettings = async () => {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("public_settings")
      .select("current_week")
      .single();
    if (error) throw error;
    return data;
  };

  const fetchTeams = async () => {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("teams")
      .select(
        "id,name,current_week_score,cumulative_score,tikuns_balance,previous_rank,is_active"
      );
    if (error) throw error;
    return (data || []).map((team) => ({
      ...team,
      is_active: team.is_active !== false,
    }));
  };

  const fetchProducts = async () => {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("products")
      .select("id,name,description,price,category,is_active")
      .order("category", { ascending: true })
      .order("price", { ascending: true });
    if (error) throw error;
    return (data || []).map((product) => ({
      ...product,
      is_active: product.is_active !== false,
      category: product.category || "other",
    }));
  };

  const createOrder = async ({ team_id, product_id, telegram_contact, comment }) => {
    const supabase = await getSupabase();
    const { error } = await supabase.from("orders").insert([
      {
        team_id,
        product_id,
        telegram_contact,
        comment: comment || null,
        status: "new",
      },
    ]);
    if (error) throw error;
  };

  window.TikunBank = {
    PRODUCT_CATEGORIES,
    getRanking,
    formatMoney,
    formatDate,
    fetchPublicSettings,
    fetchTeams,
    fetchProducts,
    createOrder,
    __DATA_LOADED__: true,
  };
})();
