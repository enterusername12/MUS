// Dummy Data
        const pollsData = [
            {
                id: 1,
                title: "Best Campus Food Option",
                status: "active",
                endDate: "Oct 20",
                totalVotes: 234,
                participation: 68,
                options: [
                    { name: "Pizza Place", votes: 89, percentage: 38, color: "#c2577e" },
                    { name: "Sandwich Bar", votes: 67, percentage: 29, color: "#5a2154" },
                    { name: "Asian Cuisine", votes: 54, percentage: 23, color: "#a04573" },
                    { name: "Salad Station", votes: 24, percentage: 10, color: "#dc92ac" }
                ]
            },
            {
                id: 2,
                title: "Favorite Study Spot",
                status: "active",
                endDate: "Oct 18",
                totalVotes: 189,
                participation: 55,
                options: [
                    { name: "Main Library", votes: 72, percentage: 38, color: "#c2577e" },
                    { name: "Coffee Shop", votes: 56, percentage: 30, color: "#5a2154" },
                    { name: "Student Center", votes: 41, percentage: 22, color: "#a04573" },
                    { name: "Outdoor Quad", votes: 20, percentage: 10, color: "#dc92ac" }
                ]
            },
            {
                id: 3,
                title: "Preferred Library Hours",
                status: "completed",
                endDate: "Oct 10",
                totalVotes: 456,
                participation: 82,
                options: [
                    { name: "24/7 Access", votes: 183, percentage: 40, color: "#c2577e" },
                    { name: "6am - Midnight", votes: 137, percentage: 30, color: "#5a2154" },
                    { name: "8am - 10pm", votes: 91, percentage: 20, color: "#a04573" },
                    { name: "9am - 6pm", votes: 45, percentage: 10, color: "#dc92ac" }
                ]
            },
            {
                id: 4,
                title: "Best Campus Event This Semester",
                status: "active",
                endDate: "Oct 25",
                totalVotes: 322,
                participation: 71,
                options: [
                    { name: "Music Festival", votes: 129, percentage: 40, color: "#c2577e" },
                    { name: "Career Fair", votes: 96, percentage: 30, color: "#5a2154" },
                    { name: "Sports Day", votes: 64, percentage: 20, color: "#a04573" },
                    { name: "Cultural Night", votes: 33, percentage: 10, color: "#dc92ac" }
                ]
            }
        ];

        const studentsData = [
            {
                id: 1,
                name: "Alex Chen",
                award: "Research Excellence Award",
                month: "January",
                year: "2024",
                engagementScore: 95,
                chartData: [95, 88, 92, 90, 87, 93, 91, 95]
            },
            {
                id: 2,
                name: "Sarah Johnson",
                award: "Community Service Leader",
                month: "February",
                year: "2024",
                engagementScore: 88,
                chartData: [85, 87, 88, 86, 89, 88, 90, 88]
            },
            {
                id: 3,
                name: "Michael Brown",
                award: "Innovation Challenge Winner",
                month: "March",
                year: "2024",
                engagementScore: 92,
                chartData: [90, 91, 92, 89, 93, 92, 91, 92]
            },
            {
                id: 4,
                name: "Emily Davis",
                award: "Leadership Excellence",
                month: "April",
                year: "2024",
                engagementScore: 91,
                chartData: [88, 90, 91, 92, 89, 91, 90, 91]
            }
        ];

        let currentPoll = pollsData[0];
        let currentStudent = studentsData[0];

        // Initialize
        document.addEventListener('DOMContentLoaded', function() {
            renderPolls();
            renderStudents();
            displayPollDetails(currentPoll);
            displayStudentDetails(currentStudent);
        });

        function switchTab(tab) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));
            
            if (tab === 'polls') {
                document.querySelectorAll('.tab')[0].classList.add('active');
                document.getElementById('polls-content').classList.add('active');
            } else {
                document.querySelectorAll('.tab')[1].classList.add('active');
                document.getElementById('students-content').classList.add('active');
            }
        }

        function renderPolls(filteredData = pollsData) {
            const pollList = document.getElementById('pollList');
            pollList.innerHTML = '';
            
            filteredData.forEach(poll => {
                const card = document.createElement('div');
                card.className = 'poll-card' + (poll.id === currentPoll.id ? ' selected' : '');
                card.onclick = () => selectPoll(poll);
                
                card.innerHTML = `
                    <span class="poll-status status-${poll.status}">● ${poll.status}</span>
                    <span class="poll-end">Ends: ${poll.endDate}</span>
                    <div class="poll-title">${poll.title}</div>
                    <div class="poll-stats">${poll.totalVotes} votes</div>
                    <div class="poll-stats">Participation: ${poll.participation}%</div>
                `;
                
                pollList.appendChild(card);
            });
        }

        function selectPoll(poll) {
            currentPoll = poll;
            renderPolls();
            displayPollDetails(poll);
        }

        function displayPollDetails(poll) {
            const details = document.getElementById('pollDetails');
            
            let optionBars = '';
            poll.options.forEach(option => {
                optionBars += `
                    <div class="option-bar">
                        <div class="option-header">
                            <span class="option-name">${option.name}</span>
                            <span class="option-votes">${option.votes} votes (${option.percentage}%)</span>
                        </div>
                        <div class="bar-container">
                            <div class="bar-fill" style="width: ${option.percentage}%; background: ${option.color};"></div>
                        </div>
                    </div>
                `;
            });

            const pieChart = createPieChart(poll.options);
            
            details.innerHTML = `
                <div class="section-title">Result Overview</div>
                <div class="result-title">${poll.title}</div>
                ${optionBars}
                <div class="chart-container">
                    <div class="pie-chart">${pieChart}</div>
                </div>
                <div class="section-title" style="margin-top: 20px;">Poll Performance Chart</div>
                <div class="chart-legend">
                    ${poll.options.map(opt => `
                        <div class="legend-item">
                            <div class="legend-color" style="background: ${opt.color};"></div>
                            <span>${opt.name}: ${opt.percentage}%</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        function createPieChart(options) {
            let startAngle = -90;
            let paths = '';
            
            options.forEach(option => {
                const angle = (option.percentage / 100) * 360;
                const endAngle = startAngle + angle;
                
                const x1 = 150 + 140 * Math.cos(startAngle * Math.PI / 180);
                const y1 = 150 + 140 * Math.sin(startAngle * Math.PI / 180);
                const x2 = 150 + 140 * Math.cos(endAngle * Math.PI / 180);
                const y2 = 150 + 140 * Math.sin(endAngle * Math.PI / 180);
                
                const largeArc = angle > 180 ? 1 : 0;
                
                paths += `
                    <path d="M 150 150 L ${x1} ${y1} A 140 140 0 ${largeArc} 1 ${x2} ${y2} Z" 
                          fill="${option.color}" 
                          stroke="white" 
                          stroke-width="2"/>
                `;
                
                const labelAngle = startAngle + angle / 2;
                const labelX = 150 + 100 * Math.cos(labelAngle * Math.PI / 180);
                const labelY = 150 + 100 * Math.sin(labelAngle * Math.PI / 180);
                
                paths += `
                    <text x="${labelX}" y="${labelY}" 
                          text-anchor="middle" 
                          dominant-baseline="middle" 
                          fill="white" 
                          font-weight="bold" 
                          font-size="14">
                        ${option.percentage}%
                    </text>
                `;
                
                startAngle = endAngle;
            });
            
            return `<svg viewBox="0 0 300 300">${paths}</svg>`;
        }

        function filterPolls() {
            const search = document.getElementById('searchInput').value.toLowerCase();
            const filtered = pollsData.filter(poll => 
                poll.title.toLowerCase().includes(search)
            );
            renderPolls(filtered);
        }

        function renderStudents(filteredData = studentsData) {
            const studentList = document.getElementById('studentList');
            studentList.innerHTML = '';
            
            filteredData.forEach(student => {
                const card = document.createElement('div');
                card.className = 'student-card' + (student.id === currentStudent.id ? ' selected' : '');
                card.onclick = () => selectStudent(student);
                
                card.innerHTML = `
                    <div class="student-date">${student.month} ${student.year}</div>
                    <div class="student-name">${student.name}</div>
                    <div class="student-award">${student.award}</div>
                    <div class="engagement-score">Engagement Score: ${student.engagementScore}</div>
                `;
                
                studentList.appendChild(card);
            });
        }

        function selectStudent(student) {
            currentStudent = student;
            renderStudents();
            displayStudentDetails(student);
        }

        function displayStudentDetails(student) {
            const details = document.getElementById('studentDetails');
            const lineChart = createLineChart(student.chartData);
            
            details.innerHTML = `
                <div class="section-title">Result Overview</div>
                <div class="result-title">
                    ${student.name}
                    <span class="score-badge">${student.engagementScore}</span>
                </div>
                <div style="color: #666; font-size: 16px; margin-bottom: 20px;">${student.award}</div>
                <div style="color: #666; font-size: 14px; margin-bottom: 20px;">Engagement Score</div>
                
                <div class="detail-row">
                    <div class="detail-col">
                        <div class="detail-label">Month</div>
                        <div class="detail-value">${student.month}</div>
                    </div>
                    <div class="detail-col">
                        <div class="detail-label">Year</div>
                        <div class="detail-value">${student.year}</div>
                    </div>
                </div>
                
                <div class="section-title" style="margin-top: 40px;">Engagement Overview</div>
                <div class="line-chart">${lineChart}</div>
            `;
        }

        function createLineChart(data) {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
            const width = 900;
            const height = 300;
            const padding = 50;
            const chartWidth = width - padding * 2;
            const chartHeight = height - padding * 2;
            
            const maxValue = 100;
            const minValue = 80;
            
            let points = '';
            let circles = '';
            
            data.forEach((value, i) => {
                const x = padding + (i / (data.length - 1)) * chartWidth;
                const y = padding + chartHeight - ((value - minValue) / (maxValue - minValue)) * chartHeight;
                
                points += `${x},${y} `;
                circles += `<circle cx="${x}" cy="${y}" r="4" fill="#8b3a62" stroke="white" stroke-width="2"/>`;
            });
            
            let gridLines = '';
            for (let i = 0; i <= 4; i++) {
                const y = padding + (i / 4) * chartHeight;
                const value = maxValue - (i / 4) * (maxValue - minValue);
                gridLines += `
                    <line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" 
                          stroke="#e5e5e5" stroke-dasharray="3,3"/>
                    <text x="${padding - 10}" y="${y}" text-anchor="end" 
                          dominant-baseline="middle" font-size="12" fill="#666">
                        ${value}
                    </text>
                `;
            }
            
            let xLabels = '';
            months.forEach((month, i) => {
                const x = padding + (i / (months.length - 1)) * chartWidth;
                xLabels += `
                    <text x="${x}" y="${height - padding + 20}" 
                          text-anchor="middle" font-size="12" fill="#666">
                        ${month}
                    </text>
                `;
            });
            
            return `
                <svg viewBox="0 0 ${width} ${height}">
                    ${gridLines}
                    ${xLabels}
                    <polyline points="${points}" fill="none" stroke="#8b3a62" stroke-width="2"/>
                    ${circles}
                </svg>
            `;
        }

        function filterStudents() {
            const month = document.getElementById('monthFilter').value;
            const year = document.getElementById('yearFilter').value;
            
            const filtered = studentsData.filter(student => {
                return (!month || student.month === month) && (!year || student.year === year);
            });
            
            renderStudents(filtered);
        }