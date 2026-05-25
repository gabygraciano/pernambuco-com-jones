/**
 * ==========================================================================
 * PERNAMBUCO COM JONES - LÓGICA PRINCIPAL DO APLICATIVO (JS)
 * ==========================================================================
 */

// Configurações Globais
const ADMIN_PIN = "jones2026";
let geojsonData = null;
let activeCities = [];
let allMunicipalities = [];
let width = 0;
let height = 0;

// Seletores D3 e DOM
const svg = d3.select("#map-svg");
const g = svg.append("g").attr("class", "map-group");
const tooltip = document.getElementById("map-tooltip");

// Função de normalização para comparação de strings (ignora acentos, espaços e caixa)
function normalizeString(str) {
  if (!str) return "";
  return str
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "") // Mantém apenas letras e números
    .trim();
}

// Inicialização do Aplicativo
document.addEventListener("DOMContentLoaded", () => {
  setupDimensions();
  loadData();
  setupEventListeners();
});

// Configura as dimensões do SVG com base na tela
function setupDimensions() {
  const container = document.getElementById("map-container");
  width = container.clientWidth;
  height = container.clientHeight;
  svg.attr("viewBox", `0 0 ${width} ${height}`);
}

// Recalcula dimensões ao redimensionar a janela
window.addEventListener("resize", () => {
  setupDimensions();
  if (geojsonData) {
    renderMap(geojsonData);
  }
});

// Carrega os dados (GeoJSON + Cidades Doadoras)
function loadData() {
  // Sincroniza a lista de cidades com o localStorage
  const savedCities = localStorage.getItem("jones_donating_cities");
  if (savedCities) {
    activeCities = JSON.parse(savedCities);
  } else {
    // Carrega do arquivo data.js (cidadesDoadorasIniciais deve estar carregado globalmente)
    activeCities = typeof cidadesDoadorasIniciais !== "undefined" ? [...cidadesDoadorasIniciais] : [];
    localStorage.setItem("jones_donating_cities", JSON.stringify(activeCities));
  }

  // Carrega o arquivo GeoJSON local
  fetch("pe-municipalities.json")
    .then((response) => {
      if (!response.ok) {
        throw new Error("Erro ao carregar o GeoJSON do mapa.");
      }
      return response.json();
    })
    .then((geojson) => {
      geojsonData = geojson;
      
      // Extrai dinamicamente todos os nomes oficiais dos municípios de Pernambuco
      allMunicipalities = geojson.features
        .map((f) => f.properties.name)
        .sort((a, b) => a.localeCompare(b, "pt-BR"));
      
      // Inicializa o mapa
      renderMap(geojson);
      // Atualiza painéis de informações e administração
      updateStats();
      setupAutocomplete();
      setupAdminAutocomplete();
      renderActiveCitiesAdmin();
    })
    .catch((error) => {
      console.error("Falha ao inicializar o mapa:", error);
      alert("Houve um problema ao carregar o mapa. Verifique se o arquivo pe-municipalities.json está correto.");
    });
}

// Renderiza o mapa SVG usando D3.js
function renderMap(geojson) {
  // Limpa elementos anteriores se houver (para redimensionamento)
  g.selectAll("*").remove();

  // Filtra Fernando de Noronha para ajustar o enquadramento do continente
  const continenteFeatures = geojson.features.filter(
    (f) => normalizeString(f.properties.name) !== "fernandodenoronha"
  );
  const continenteGeojson = { type: "FeatureCollection", features: continenteFeatures };

  // Define a projeção ajustada para preencher e centralizar o continente de Pernambuco
  const projection = d3.geoMercator().fitSize([width - 40, height - 40], continenteGeojson);
  const pathGenerator = d3.geoPath().projection(projection);

  // Desenha os municípios (paths)
  g.selectAll(".municipality")
    .data(geojson.features)
    .enter()
    .append("path")
    .attr("class", (d) => {
      const isDonated = isCityDonated(d.properties.name);
      return `municipality ${isDonated ? "donated-city" : ""}`;
    })
    .attr("d", pathGenerator)
    .attr("id", (d) => `city-${normalizeString(d.properties.name)}`)
    .on("mouseover", function (event, d) {
      const cityName = d.properties.name;
      const isDonated = isCityDonated(cityName);
      
      tooltip.style.opacity = "1";
      tooltip.innerHTML = `
        <div class="tooltip-title">${cityName}</div>
        <div class="tooltip-status ${isDonated ? "donated" : "pending"}">
          <span class="badge"></span>
          ${isDonated ? "Apoiou a vaquinha 🌟" : "Ainda não demarcada"}
        </div>
      `;
    })
    .on("mousemove", function (event) {
      // Ajusta posição do tooltip em relação ao cursor
      tooltip.style.left = event.pageX + 15 + "px";
      tooltip.style.top = event.pageY - 15 + "px";
    })
    .on("mouseout", function () {
      tooltip.style.opacity = "0";
    });

  // Configura a interatividade de Zoom e Pan
  const zoom = d3.zoom()
    .scaleExtent([1, 25])
    .translateExtent([[0, 0], [width, height]])
    .on("zoom", (event) => {
      g.attr("transform", event.transform);
    });

  svg.call(zoom);

  // Associa os botões de controle de zoom na interface
  d3.select("#zoom-in").on("click", () => {
    svg.transition().duration(400).call(zoom.scaleBy, 1.5);
  });
  d3.select("#zoom-out").on("click", () => {
    svg.transition().duration(400).call(zoom.scaleBy, 0.6);
  });
  d3.select("#zoom-reset").on("click", () => {
    svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity);
  });
}

// Verifica se uma cidade está marcada como doadora
function isCityDonated(cityName) {
  const normName = normalizeString(cityName);
  return activeCities.some((c) => normalizeString(c) === normName);
}

// Atualiza o contador de cidades doadoras e barra de progresso
function updateStats() {
  const totalCount = activeCities.length;
  const totalCities = 185; // Pernambuco possui 185 municípios oficiais
  const percent = Math.min(Math.round((totalCount / totalCities) * 100), 100);

  // Animação de contagem
  const countEl = document.getElementById("stats-count");
  if (countEl) {
    countEl.textContent = totalCount;
  }

  // Atualiza detalhes da meta
  const metaEl = document.getElementById("stats-meta");
  if (metaEl) {
    metaEl.textContent = `${totalCount} de ${totalCities} municípios (${percent}%)`;
  }

  // Preenche a barra de progresso
  const progressFill = document.getElementById("progress-fill");
  if (progressFill) {
    progressFill.style.width = `${percent}%`;
  }
}

// Foca em um município específico, aplicando zoom e efeito pulse
function focusCity(cityName) {
  if (!geojsonData) return;

  const feature = geojsonData.features.find(
    (f) => normalizeString(f.properties.name) === normalizeString(cityName)
  );

  if (!feature) return;

  // Encontra o path D3 correspondente e adiciona a animação
  const pathId = `#city-${normalizeString(cityName)}`;
  const pathEl = d3.select(pathId);
  
  if (pathEl.node()) {
    // Remove pulse anterior se houver
    d3.selectAll(".municipality").classed("pulse-highlight", false);
    // Adiciona classe de animação
    pathEl.classed("pulse-highlight", true);

    // Remove animação de pulsar após 2.5s
    setTimeout(() => {
      pathEl.classed("pulse-highlight", false);
    }, 2500);

    // Filtra Fernando de Noronha para enquadramento correto do continente
    const continenteFeatures = geojsonData.features.filter(
      (f) => normalizeString(f.properties.name) !== "fernandodenoronha"
    );
    const continenteGeojson = { type: "FeatureCollection", features: continenteFeatures };

    // Calcula os limites geográficos para centralizar
    const projection = d3.geoMercator().fitSize([width - 40, height - 40], continenteGeojson);
    const pathGenerator = d3.geoPath().projection(projection);
    const centroid = pathGenerator.centroid(feature);

    if (centroid && !isNaN(centroid[0]) && !isNaN(centroid[1])) {
      // Zoom focado no centroide do município
      const zoomScale = 6; // Nível de zoom ideal para destacar um município
      const tX = width / 2 - centroid[0] * zoomScale;
      const tY = height / 2 - centroid[1] * zoomScale;

      const zoom = d3.zoom().on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

      svg.transition()
        .duration(800)
        .call(
          zoom.transform,
          d3.zoomIdentity.translate(tX, tY).scale(zoomScale)
        );
    }
  }
}

// Configura o Autocomplete da Barra de Pesquisa Pública
function setupAutocomplete() {
  const searchInput = document.getElementById("search-input");
  const resultsContainer = document.getElementById("search-results");

  searchInput.addEventListener("input", () => {
    const query = normalizeString(searchInput.value);
    resultsContainer.innerHTML = "";

    if (!query) {
      resultsContainer.style.display = "none";
      return;
    }

    const matches = allMunicipalities.filter((city) =>
      normalizeString(city).includes(query)
    );

    if (matches.length === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "search-result-item";
      emptyDiv.textContent = "Nenhuma cidade encontrada";
      emptyDiv.style.cursor = "default";
      resultsContainer.appendChild(emptyDiv);
    } else {
      matches.forEach((cityName) => {
        const item = document.createElement("div");
        item.className = "search-result-item";
        
        const isDonated = isCityDonated(cityName);
        item.innerHTML = `
          <span>${cityName}</span>
          <span class="city-status ${isDonated ? "donated" : "pending"}">
            ${isDonated ? "Apoiou" : "Não demarcada"}
          </span>
        `;
        
        item.addEventListener("click", () => {
          searchInput.value = cityName;
          resultsContainer.style.display = "none";
          focusCity(cityName);
        });
        resultsContainer.appendChild(item);
      });
    }

    resultsContainer.style.display = "block";
  });

  // Fecha o autocomplete ao clicar fora
  document.addEventListener("click", (e) => {
    if (!searchInput.contains(e.target) && !resultsContainer.contains(e.target)) {
      resultsContainer.style.display = "none";
    }
  });
}

// ==========================================================================
// SEÇÃO ADMINISTRATIVA (ADMIN CONTROL PANEL)
// ==========================================================================

function setupEventListeners() {
  // Elementos do Modal de Login
  const adminTrigger = document.getElementById("admin-trigger");
  const loginModal = document.getElementById("login-modal");
  const closeLogin = document.getElementById("close-login");
  const pinInput = document.getElementById("pin-input");
  const pinError = document.getElementById("pin-error");
  const loginBtn = document.getElementById("login-btn");

  // Elementos do Modal Administrativo
  const adminModal = document.getElementById("admin-modal");
  const closeAdmin = document.getElementById("close-admin");
  const btnExport = document.getElementById("admin-export-btn");
  const btnReset = document.getElementById("admin-reset-btn");
  const csvFile = document.getElementById("csv-file");
  const uploadZone = document.getElementById("upload-zone");

  // Abrir login
  adminTrigger.addEventListener("click", () => {
    loginModal.classList.add("active");
    pinInput.value = "";
    pinError.style.display = "none";
    pinInput.focus();
  });

  // Fechar login
  closeLogin.addEventListener("click", () => {
    loginModal.classList.remove("active");
  });

  // Fechar admin
  closeAdmin.addEventListener("click", () => {
    adminModal.classList.remove("active");
  });

  // Submeter PIN de login
  loginBtn.addEventListener("click", checkPin);
  pinInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") checkPin();
  });

  function checkPin() {
    if (pinInput.value === ADMIN_PIN) {
      loginModal.classList.remove("active");
      adminModal.classList.add("active");
      renderActiveCitiesAdmin();
    } else {
      pinError.style.display = "block";
      pinInput.value = "";
      pinInput.focus();
    }
  }

  // Exportar data.js
  btnExport.addEventListener("click", exportDataFile);

  // Restaurar dados padrão de fábrica
  btnReset.addEventListener("click", () => {
    if (confirm("Tem certeza que deseja restaurar as cidades padrão iniciais? Suas edições atuais serão sobrescritas.")) {
      activeCities = typeof cidadesDoadorasIniciais !== "undefined" ? [...cidadesDoadorasIniciais] : [];
      saveStateAndReload();
    }
  });

  // Upload de CSV
  csvFile.addEventListener("change", handleCsvUpload);

  // Drag & Drop na zona de upload
  ["dragenter", "dragover"].forEach((eventName) => {
    uploadZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      uploadZone.classList.add("dragover");
    }, false);
  });

  ["dragleave", "drop"].forEach((eventName) => {
    uploadZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      uploadZone.classList.remove("dragover");
    }, false);
  });

  uploadZone.addEventListener("drop", (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length) {
      csvFile.files = files;
      processCsv(files[0]);
    }
  });

  uploadZone.addEventListener("click", () => {
    csvFile.click();
  });

  // ==========================================================================
  // CONFIGURAÇÃO E INTEGRAÇÃO DO SALVAMENTO AUTOMÁTICO VIA API DO GITHUB
  // ==========================================================================
  const ghToken = document.getElementById("github-token");
  const ghRepo = document.getElementById("github-repo");
  const ghBranch = document.getElementById("github-branch");
  const ghSaveBtn = document.getElementById("github-save-btn");
  const ghStatus = document.getElementById("github-status");

  // Carrega configurações anteriores do GitHub do localStorage
  ghToken.value = localStorage.getItem("jones_github_token") || "";
  ghRepo.value = localStorage.getItem("jones_github_repo") || "";
  ghBranch.value = localStorage.getItem("jones_github_branch") || "main";

  // Salva automaticamente as edições das credenciais
  [ghToken, ghRepo, ghBranch].forEach((input) => {
    input.addEventListener("input", () => {
      localStorage.setItem("jones_github_token", ghToken.value.trim());
      localStorage.setItem("jones_github_repo", ghRepo.value.trim());
      localStorage.setItem("jones_github_branch", ghBranch.value.trim());
    });
  });

  // Ação de Publicar no GitHub
  ghSaveBtn.addEventListener("click", async () => {
    const token = ghToken.value.trim();
    const repo = ghRepo.value.trim();
    const branch = ghBranch.value.trim();

    if (!token || !repo || !branch) {
      showGitHubStatus("Erro: Por favor, preencha todos os campos do GitHub.", "var(--color-red)");
      return;
    }

    showGitHubStatus("Conectando ao GitHub...", "var(--color-yellow)");
    ghSaveBtn.disabled = true;

    try {
      // 1. Gera o conteúdo do arquivo data.js atualizado
      const timestamp = new Date().toLocaleString("pt-BR");
      const fileContent = `/**
 * LISTA DE CIDADES DOADORAS - ATUALIZAÇÃO AUTOMÁTICA
 * Arquivo gerado via painel administrativo em ${timestamp}
 * Substitua este arquivo na pasta do seu repositório no GitHub para publicar globalmente.
 */

const cidadesDoadorasIniciais = ${JSON.stringify(activeCities, null, 2)};
`;

      // 2. Busca o arquivo atual no repositório para obter o SHA (obrigatório pelo GitHub para atualizações)
      const getUrl = `https://api.github.com/repos/${repo}/contents/data.js?ref=${branch}`;
      let sha = null;

      const getResponse = await fetch(getUrl, {
        headers: {
          "Authorization": `token ${token}`,
          "Accept": "application/vnd.github.v3+json"
        }
      });

      if (getResponse.ok) {
        const fileData = await getResponse.json();
        sha = fileData.sha;
      } else if (getResponse.status !== 404) {
        throw new Error(`Conexão falhou com código HTTP ${getResponse.status}`);
      }

      // 3. Converte o conteúdo do arquivo para base64 com suporte UTF-8 (acentos brasileiros)
      const base64Content = btoa(unescape(encodeURIComponent(fileContent)));

      // 4. Executa a gravação (PUT) no repositório remoto
      const putResponse = await fetch(`https://api.github.com/repos/${repo}/contents/data.js`, {
        method: "PUT",
        headers: {
          "Authorization": `token ${token}`,
          "Content-Type": "application/json",
          "Accept": "application/vnd.github.v3+json"
        },
        body: JSON.stringify({
          message: `Atualização de cidades doadoras via painel admin [${timestamp}]`,
          content: base64Content,
          branch: branch,
          sha: sha || undefined
        })
      });

      if (putResponse.ok) {
        showGitHubStatus("Sucesso! Cidades publicadas no GitHub. O site será atualizado em 1 minuto! 🚀", "#2ea44f");
      } else {
        const errData = await putResponse.json();
        throw new Error(errData.message || "Erro no envio dos dados.");
      }

    } catch (error) {
      console.error("Erro na integração com GitHub:", error);
      showGitHubStatus(`Erro ao salvar no GitHub: ${error.message}`, "var(--color-red)");
    } finally {
      ghSaveBtn.disabled = false;
    }
  });

  function showGitHubStatus(msg, color) {
    ghStatus.textContent = msg;
    ghStatus.style.backgroundColor = color === "#2ea44f" ? "rgba(46, 164, 79, 0.15)" : 
                                    color === "var(--color-red)" ? "rgba(230, 51, 55, 0.15)" : "rgba(252, 198, 67, 0.15)";
    ghStatus.style.color = color;
    ghStatus.style.border = `1px solid ${color}`;
    ghStatus.style.display = "block";
  }
}

// Configura o Autocomplete no Painel Admin
function setupAdminAutocomplete() {
  const adminInput = document.getElementById("admin-city-input");
  const resultsContainer = document.getElementById("admin-autocomplete-results");
  const addBtn = document.getElementById("admin-add-btn");

  adminInput.addEventListener("input", () => {
    const query = normalizeString(adminInput.value);
    resultsContainer.innerHTML = "";

    if (!query) {
      resultsContainer.style.display = "none";
      return;
    }

    // Filtra cidades válidas que AINDA NÃO apoiaram (evita duplicatas)
    const matches = allMunicipalities.filter(
      (city) =>
        normalizeString(city).includes(query) && !isCityDonated(city)
    );

    if (matches.length === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "admin-autocomplete-item";
      emptyDiv.textContent = "Nenhuma nova cidade encontrada";
      emptyDiv.style.cursor = "default";
      resultsContainer.appendChild(emptyDiv);
    } else {
      matches.forEach((cityName) => {
        const item = document.createElement("div");
        item.className = "admin-autocomplete-item";
        item.textContent = cityName;
        
        item.addEventListener("click", () => {
          adminInput.value = cityName;
          resultsContainer.style.display = "none";
        });
        resultsContainer.appendChild(item);
      });
    }

    resultsContainer.style.display = "block";
  });

  // Clique no botão Adicionar Manualmente
  addBtn.addEventListener("click", addCityManual);
  adminInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") addCityManual();
  });

  function addCityManual() {
    const cityNameInput = adminInput.value.trim();
    if (!cityNameInput) return;

    // Procura na lista de municípios oficiais para garantir grafia idêntica
    const matchedCityName = allMunicipalities.find(
      (c) => normalizeString(c) === normalizeString(cityNameInput)
    );

    if (!matchedCityName) {
      alert(`Município "${cityNameInput}" não reconhecido em Pernambuco. Por favor, selecione um nome da lista oficial.`);
      return;
    }

    if (isCityDonated(matchedCityName)) {
      alert(`O município de ${matchedCityName} já está demarcado.`);
      adminInput.value = "";
      return;
    }

    activeCities.push(matchedCityName);
    activeCities.sort((a, b) => a.localeCompare(b, "pt-BR"));
    saveStateAndReload();
    
    // Sucesso visual temporário no input
    adminInput.value = "";
    resultsContainer.style.display = "none";
  }

  // Fechar autocomplete ao clicar fora
  document.addEventListener("click", (e) => {
    if (!adminInput.contains(e.target) && !resultsContainer.contains(e.target)) {
      resultsContainer.style.display = "none";
    }
  });
}

// Renderiza a lista de cidades ativas no Painel Admin
function renderActiveCitiesAdmin() {
  const container = document.getElementById("active-cities-list");
  if (!container) return;

  container.innerHTML = "";

  if (activeCities.length === 0) {
    container.innerHTML = `
      <div style="padding: 1.5rem; text-align: center; color: var(--color-gray-light); font-size: 0.85rem;">
        Nenhuma cidade demarcada ainda.
      </div>
    `;
    return;
  }

  activeCities.forEach((city) => {
    const item = document.createElement("div");
    item.className = "active-city-item";
    
    item.innerHTML = `
      <span class="active-city-name">${city}</span>
      <button class="active-city-remove" title="Remover cidade" data-city="${city}">&times;</button>
    `;

    item.querySelector(".active-city-remove").addEventListener("click", () => {
      removeCity(city);
    });

    container.appendChild(item);
  });
}

// Remove uma cidade do mapa
function removeCity(cityName) {
  activeCities = activeCities.filter((c) => normalizeString(c) !== normalizeString(cityName));
  saveStateAndReload();
}

// Processa o upload de CSV
function handleCsvUpload(e) {
  const file = e.target.files[0];
  if (file) {
    processCsv(file);
  }
}

// Lê e interpreta o CSV
function processCsv(file) {
  if (!file.name.endsWith(".csv")) {
    alert("Por favor, selecione apenas arquivos formato CSV.");
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    const text = e.target.result;
    
    // Quebra as linhas do CSV
    const lines = text.split(/\r?\n/);
    let addedCount = 0;

    lines.forEach((line, index) => {
      // Limpa dados e aspas da linha
      const cleanLine = line.replace(/"/g, "").trim();
      if (!cleanLine) return;

      // Restringe a análise apenas à primeira coluna do CSV
      const parts = cleanLine.split(/[,;]/);
      if (parts.length > 0) {
        const potentialCity = parts[0].trim();
        if (!potentialCity) return;

        // Pula o cabeçalho se ele contiver palavras identificadoras comuns
        if (index === 0 && (
          normalizeString(potentialCity) === "cidade" || 
          normalizeString(potentialCity) === "municipio" || 
          normalizeString(potentialCity) === "municipios" ||
          normalizeString(potentialCity) === "nome"
        )) {
          return;
        }

        // Procura correspondência na lista oficial de municípios de Pernambuco
        const matchedCityName = allMunicipalities.find(
          (c) => normalizeString(c) === normalizeString(potentialCity)
        );

        if (matchedCityName) {
          if (!isCityDonated(matchedCityName)) {
            activeCities.push(matchedCityName);
            addedCount++;
          }
        }
      }
    });

    if (addedCount > 0) {
      activeCities.sort((a, b) => a.localeCompare(b, "pt-BR"));
      saveStateAndReload();
      alert(`Sucesso! ${addedCount} novas cidades válidas foram importadas e adicionadas ao mapa.`);
    } else {
      alert("Nenhuma cidade nova foi importada. Certifique-se de que a primeira coluna da planilha possui nomes oficiais de municípios de Pernambuco.");
    }
    
    // Limpa o input de arquivo para permitir novos uploads do mesmo arquivo
    document.getElementById("csv-file").value = "";
  };

  reader.readAsText(file, "UTF-8");
}

// Salva o estado no LocalStorage e atualiza o mapa e as estatísticas em tempo real
function saveStateAndReload() {
  localStorage.setItem("jones_donating_cities", JSON.stringify(activeCities));
  updateStats();
  renderActiveCitiesAdmin();
  
  // Atualiza as cores do mapa sem redesenhar toda a estrutura SVG
  g.selectAll(".municipality")
    .classed("donated-city", (d) => isCityDonated(d.properties.name));
}

// Gera e exporta o arquivo data.js atualizado
function exportDataFile() {
  const timestamp = new Date().toLocaleString("pt-BR");
  const fileContent = `/**
 * LISTA DE CIDADES DOADORAS - ATUALIZAÇÃO AUTOMÁTICA
 * Arquivo gerado via painel administrativo em ${timestamp}
 * Substitua este arquivo na pasta do seu repositório no GitHub para publicar globalmente.
 */

const cidadesDoadorasIniciais = ${JSON.stringify(activeCities, null, 2)};
`;

  const blob = new Blob([fileContent], { type: "text/javascript;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  a.download = "data.js";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
