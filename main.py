import requests
import re

def main():
    current_map = input("What map are you playing:")
    matches = get_posts("https://vlrggapi-pmij-7azlkth9s-rehkloos-projects.vercel.app/v2/match?q=results&num_pages=1&max_retries=3&request_delay=1&timeout=30")
    match_ids = []
    for match in matches["data"]["segments"]:
        match_id = re.split(r'/', match["match_page"])[1]
        match_ids.append(match_id)

    for match_id in match_ids:
        break_flag = False
        details = get_posts(f"https://vlrggapi-pmij-7azlkth9s-rehkloos-projects.vercel.app/v2/match/details?match_id={match_id}")
        for map_data in details["data"]["segments"][0]["maps"]:
            if map_data["map_name"] == current_map:
                if map_data["score"]["team1"] > map_data["score"]["team2"]:
                    for agent in map_data["players"]["team1"]:
                        print(agent["agent"])
                else:
                    for agent in map_data["players"]["team2"]:
                        print(agent["agent"])
                break_flag = True
                break
        if break_flag:
            break

def get_posts(url):
    response = requests.get(url)
    if response.status_code == 200:
        return response.json()
    else:
        print(f"Failed to retrieve data from {url}")
        return None

if __name__ == '__main__':
    main()